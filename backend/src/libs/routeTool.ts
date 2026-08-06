import { ServerError } from '@/libs/appError.js';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

export const parseRouteFromFileUrl = (fileURL: string) => {
  const __filename = fileURLToPath(fileURL);
  const __dirname = dirname(__filename);

  const tag = `${__dirname}`.replace(/^.*\/routes/, '');
  const [filename, method] = path.parse(__filename).name.split('.');
  if (!method) {
    throw new ServerError(
      `${__filename}: Method name is not contained in the filename`
    );
  }
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    throw new ServerError(`${__filename}: Invalid method name: ${method}`);
  }
  const url = `/${filename}`;
  return { method, url, tag };
};
