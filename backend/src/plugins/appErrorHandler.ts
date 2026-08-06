import { ClientError } from '@/libs/appError.js';
import { outputLog } from '@/plugins/logger.js';
import * as Fastify from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import Youch from 'youch';

export const appErrorHandler = fastifyPlugin(
  async (fastify: Fastify.FastifyInstance) => {
    fastify.setErrorHandler(async (err: Fastify.FastifyError, req, res) => {
      // ClientError の場合はエラーとして返す
      if (err instanceof ClientError) {
        return res
          .code(err.statusCode)
          .header('Content-Type', 'application/json; charset=utf-8')
          .send({ message: err.message });
      }

      // バリデーションエラーの場合はそのまま JSON で返す
      if (err.validation) {
        return res
          .code(400)
          .header('Content-Type', 'application/json; charset=utf-8')
          .send({ message: '不正な送信パラメータです' });
      }

      try {
        const youch = new Youch(err, req.raw);
        const json = await youch.toJSON();
        let message = `// 500 ${json.error.name}: ${json.error.message}\n\n`;

        const frames = json.error.frames.filter(
          (frame) => frame.isApp && !frame.file.match('libs/appError')
        );
        if (frames.find((frame) => frame.file.includes('src/routes/'))) {
          while (!frames[frames.length - 1]?.file.includes('src/routes/')) {
            frames.pop();
          }
        }

        for (const frame of frames) {
          message += `// ${frame.file}:${frame.line}\n\n`;
          if (frame.context.pre) {
            for (const line of frame.context.pre.split('\n')) {
              message += `  ${line}\n`;
            }
          }
          message += `  ${frame.context.line}\n`;
          message += `//${' '.repeat(frame.column - 1)}^^^\n`;
          if (frame.context.post) {
            for (const line of frame.context.post.split('\n')) {
              message += `  ${line}\n`;
            }
          }
          message += '\n';
        }

        if (process.env.NODE_ENV === 'development') {
          console.error(message);
          return res.code(500).type('text/plain; charset=utf-8').send(message);
        } else {
          outputLog(req, res, 'error', { message });
          return res
            .code(500)
            .type('text/plain; charset=utf-8')
            .send('Internal Server Error');
        }
      } catch (error) {
        console.error(error);
        return res.code(500).send(error);
      }
    });
  }
);

export default appErrorHandler;
