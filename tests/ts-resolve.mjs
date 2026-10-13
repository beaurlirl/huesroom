// Lets node run src/*.ts files that import each other without extensions (as the app does).
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); } catch (e) {
    if (spec.startsWith('.') && !/\\.[mc]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx);
    throw e;
  }
}`), import.meta.url);
