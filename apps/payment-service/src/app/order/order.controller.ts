import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { OrderService } from './order.service';
import { UpdateOrderDto } from './dto/update-order.dto';
import {
  OrderCreatedEventDto,
  OrderStatus,
  Topics,
} from '@ticketing-app/nest-common';
import { CreateRequestContext } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/core';

@Controller()
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly orm: MikroORM
  ) {}

  @EventPattern(Topics.OrderCreated)
  @CreateRequestContext()
  create(@Payload() createOrderDto: OrderCreatedEventDto) {
    return this.orderService.create(createOrderDto);
  }

  @EventPattern(Topics.OrderCancelled)
  @CreateRequestContext()
  update(@Payload() updateOrderDto: UpdateOrderDto) {
    return this.orderService.update(updateOrderDto.id, {
      status: OrderStatus.CANCELLED,
    });
  }
}
