import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderRepository } from './order.repository';
import { TicketRepository } from '../tickets/ticket.repository';
import { Order } from './entities/order.entity';
import { validate } from 'class-validator';
import { UserRepository } from './user.repository';
import {
  OrderStatus,
  Topics,
  IOrderCreatedEvent,
  IOrderCancelledEvent,
} from '@ticketing-app/nest-common';
import { ClientRMQ } from '@nestjs/microservices';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import constants from './constants';

const EXPIRATION_WINDOW_SECONDS = 3 * 60;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly ticketRepository: TicketRepository,
    private readonly userRepository: UserRepository,
    private readonly em: EntityManager,
    @Inject(constants.TICKETS_SERVICE)
    private readonly ticketClient: ClientRMQ,
    @InjectQueue(constants.EXPIRE_ORDER) private expireOrderQueue: Queue
  ) {}

  async create(createOrderDto: CreateOrderDto, userAuthId: string) {
    const { ticketId } = createOrderDto;
    // Find the ticket the user is trying to order in the database
    const ticket = await this.ticketRepository.findOne({
      id: ticketId,
    });
    const user = await this.userRepository.findOrCreate(userAuthId);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Make sure that this ticket is not already reserved
    const isReserved = await this.ticketRepository.isReserved(ticket);

    if (isReserved) {
      throw new BadRequestException('Ticket is already reserved');
    }

    // Calculate an expiration date for this order
    const expiration = new Date();
    expiration.setSeconds(expiration.getSeconds() + EXPIRATION_WINDOW_SECONDS);

    // Build the order and save it to the database

    const order = new Order({
      user: user,
      status: OrderStatus.CREATED,
      ticket,
      expiresAt: expiration,
    });
    const errors = await validate(order);

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Input data validation failed',
      });
    } else {
      await this.em.persistAndFlush(order);

      this.logger.log(`Publishing event: ${Topics.OrderCreated}`);
      this.ticketClient.emit<void, IOrderCreatedEvent>(Topics.OrderCreated, {
        id: order.id,
        // version: order.version,
        status: order.status,
        userId: userAuthId,
        expiresAt: order.expiresAt.toISOString(),
        ticket: {
          id: ticket.id,
          price: ticket.price,
        },
      });

      this.logger.log(order, 'Order created');
      const delay = new Date(order.expiresAt).getTime() - new Date().getTime();
      this.logger.log(`Waiting time for the job in ${delay} ms`);

      await this.expireOrderQueue.add(
        'expireOrder',
        {
          orderId: order.id,
        },
        { delay: delay }
      );

      delete order['user'];
      return order;
    }
  }

  async findAll(authId: string) {
    const user = await this.userRepository.findOne({ authId });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const orders = await this.orderRepository.find(
      {
        user,
      },
      { populate: ['ticket'] }
    );

    return orders;
  }

  findOne(id: string) {
    return this.orderRepository.findOne({ id });
  }

  async update(id: string, updateOrderDto: UpdateOrderDto) {
    const order = await this.orderRepository.findOne({ id });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    wrap(order).assign(updateOrderDto);
    await this.em.flush();

    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.EXPIRED
    ) {
      this.emitCancelEvent(order);
    }
    this.logger.log(order, 'order updated');

    return order;
  }

  async remove(id: string, userId?: string) {
    const order = await this.orderRepository.findOne({ id, user: userId });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    await this.orderRepository.nativeDelete({ id });

    this.emitCancelEvent(order);

    this.logger.log(order, 'order deleted');
    return order;
  }

  async emitCancelEvent(order: Order) {
    this.logger.log(`Publishing event: ${Topics.OrderCancelled}`);

    this.ticketClient.emit<void, IOrderCancelledEvent>(Topics.OrderCancelled, {
      id: order.id,
      ticket: {
        id: order.ticket.id,
      },
    });
  }
}
