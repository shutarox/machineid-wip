import autoload from '@fastify/autoload';
import * as Fastify from 'fastify';
import path from 'path';

import * as Config from '@/config.js';
import { generateOpenApiSchema } from '@/libs/generateOpenApiSchema.js';
import { customSerializerCompiler } from '@/plugins/customSerializerCompiler.js';
import { validatorCompiler } from 'fastify-type-provider-zod';
import { swagger } from '@/plugins/swagger.js';

const __dirname = import.meta.dirname;

const fastify = Fastify.fastify({ logger: false });

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(customSerializerCompiler);

fastify.register(swagger);

fastify.register(autoload, {
  dir: path.join(__dirname, '../src/routes'),
  ignorePattern: Config.ENABLE_DEBUG_MODE ? undefined : /debug/,
});

await fastify.ready();
await generateOpenApiSchema(fastify);
await fastify.close();
