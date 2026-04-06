import { Pool } from 'pg';
import mysql from 'mysql2/promise';
import {
  identifier,
  sql,
} from '../../../packages/sql-engine/dist/index.js';
import {
  createPostgresDriver,
  createPostgresSession,
} from '../../../packages/postgres-driver/dist/index.js';
import {
  createMySqlDriver,
  createMySqlSession,
} from '../../../packages/mysql-driver/dist/index.js';
import { Person } from '../models/objx.mjs';

function createMySqlConnectionOptions(connectionString) {
  const url = new URL(connectionString);

  return {
    host: url.hostname,
    port: Number.parseInt(url.port || '3306', 10),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    connectionLimit: 10,
  };
}

const TX_ROLLBACK_SENTINEL = 'objx-benchmark-rollback';

function createObjxRecord(dialect, session, close) {
  return {
    orm: 'objx',
    dialect,
    name: `objx-${dialect}`,
    close,
    findPersonById(id) {
      return session.execute(
        Person.query().where(({ id: personId }, op) => op.eq(personId, id)).limit(1),
        { hydrate: true },
      );
    },
    findPersonWithPets(id) {
      return session.execute(
        Person.query()
          .where(({ id: personId }, op) => op.eq(personId, id))
          .withRelated({
            pets: true,
          })
          .limit(1),
        { hydrate: true },
      );
    },
    listPeoplePage(limit, offset) {
      return session.execute(
        Person.query().orderBy(({ id }) => id, 'asc').limit(limit).offset(offset),
        { hydrate: true },
      );
    },
    countActivePeople() {
      return session.execute(
        sql`select count(*) as ${identifier('count')} from ${identifier('people')} where ${identifier('people', 'active')} = ${true}`,
      );
    },
    updatePersonActive(id, active) {
      return session.execute(
        Person.update({
          active,
        }).where(({ id: personId }, op) => op.eq(personId, id)),
      );
    },
    transactionReadWrite(id, active) {
      return session.transaction(async (trx) => {
        await trx.execute(
          Person.query().where(({ id: personId }, op) => op.eq(personId, id)).limit(1),
          { hydrate: true },
        );

        await trx.execute(
          sql`select count(*) as ${identifier('count')} from ${identifier('pets')} where ${identifier('pets', 'owner_id')} = ${id}`,
        );

        return trx.execute(
          Person.update({
            active,
          }).where(({ id: personId }, op) => op.eq(personId, id)),
        );
      });
    },
    transactionBeginCommit() {
      return session.transaction(async () => undefined);
    },
    async transactionBeginRollback() {
      try {
        await session.transaction(async () => {
          throw new Error(TX_ROLLBACK_SENTINEL);
        });
      } catch (error) {
        if (error?.cause?.message === TX_ROLLBACK_SENTINEL || error?.message === TX_ROLLBACK_SENTINEL) {
          return;
        }

        throw error;
      }
    },
  };
}

export async function createObjxAdapter(dialect, config) {
  if (dialect === 'postgres') {
    const pool = new Pool({
      connectionString: config.postgresUrl,
    });
    const driver = createPostgresDriver({
      pool,
      closePoolOnDispose: true,
    });
    const session = createPostgresSession({
      driver,
      hydrateByDefault: true,
    });

    return createObjxRecord(dialect, session, () => driver.close());
  }

  if (dialect === 'mysql') {
    const pool = mysql.createPool(createMySqlConnectionOptions(config.mysqlUrl));
    const driver = createMySqlDriver({
      pool,
      closePoolOnDispose: true,
    });
    const session = createMySqlSession({
      driver,
      hydrateByDefault: true,
    });

    return createObjxRecord(dialect, session, () => driver.close());
  }

  throw new Error(`OBJX adapter does not support dialect "${dialect}".`);
}
