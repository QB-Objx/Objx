import { createKnexAdapter } from './knex.mjs';
import { createObjxAdapter } from './objx.mjs';
import { createPrismaAdapter } from './prisma.mjs';
import { createSequelizeAdapter } from './sequelize.mjs';

const registry = {
  objx: createObjxAdapter,
  prisma: createPrismaAdapter,
  sequelize: createSequelizeAdapter,
  knex: createKnexAdapter,
};

export async function createAdapters(config) {
  const adapters = [];

  for (const dialect of config.dialects) {
    for (const orm of config.orms) {
      const factory = registry[orm];

      if (!factory) {
        throw new Error(`No adapter factory registered for ORM "${orm}".`);
      }

      adapters.push(await factory(dialect, config));
    }
  }

  return adapters;
}
