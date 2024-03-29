import { cleanEnv, port, str, url } from 'envalid';
import { Inject } from '@nestjs/common';
import { makeValidators, Static, ENVALID } from 'nestjs-envalid';

const ENVS = {
  MONGO_URI: url(),
  ORIGIN: url(),
  NODE_ENV: str({
    choices: ['development', 'test', 'production', 'staging', 'qa'],
    devDefault: 'development',
  }),
  PORT: port({ devDefault: 6000 }),
  OPENID_ISSUER: url(),
  OPENID_CLIENT_ID: str(),
  OPENID_CLIENT_SECRET: str(),
  OPENID_JWK_URL: url(),
  FUSIONAUTH_TENANT_ID: str(),
  HOSTNAME: str({ devDefault: 'order-service' }),
  RABBIT_MQ_URI: url(),
  REDIS_HOST: str({ devDefault: 'localhost' }),
  REDIS_PORT: port({ default: 6379 }),
};

export const env = cleanEnv(process.env, ENVS);

export const validators = makeValidators(ENVS);

export type Config = Static<typeof validators>;

export const InjectEnvalid = () => Inject(ENVALID);
