import * as Config from '@/config.js';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import * as Fastify from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export const swagger = fastifyPlugin(
  async (fastify: Fastify.FastifyInstance) => {
    // workaround for bug: as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unsafe-argument
    await fastify.register(fastifySwagger as any, {
      openapi: {
        info: {
          title: 'API docs',
          version: '0.1.0',
        },
        servers: [
          {
            url: Config.API_SERVER_BASE_URL,
          },
        ],
        /*
        security: [{ api_key: {} }],
        components: {
          securitySchemes: {
            api_key: {
              type: 'apiKey',
              name: 'api_key',
              in: 'header',
            },
          },
        },
        */
      },
      transform: jsonSchemaTransform,
      hideUntagged: true,
      exposeRoute: true,
    });

    await fastify.register(fastifySwaggerUi, {
      routePrefix: '/document',

      uiConfig: {
        deepLinking: false,
        // docExpansion: 'none', // 初期状態で全て閉じる
        defaultModelsExpandDepth: -1, // モデルを閉じる
      },
      uiHooks: {
        onRequest: function (request, reply, next) {
          next();
        },
        preHandler: function (request, reply, next) {
          next();
        },
      },
      staticCSP: false,
      transformStaticCSP: (header) => header,
      transformSpecification: (swaggerObject, _request, _reply) => {
        return swaggerObject;
      },
      transformSpecificationClone: true,
    });
  }
);

export default swagger;
