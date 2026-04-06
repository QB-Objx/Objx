import { Pool } from 'pg';
import mysql from 'mysql2/promise';
import {
  asc,
  eq,
  sql,
} from 'drizzle-orm';
import { drizzle as drizzleMySql } from 'drizzle-orm/mysql2';
import {
  boolean as mysqlBoolean,
  datetime,
  int,
  mysqlTable,
  varchar,
} from 'drizzle-orm/mysql-core';
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres';
import {
  boolean as postgresBoolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const TX_ROLLBACK_SENTINEL = 'objx-benchmark-rollback';

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

function createPostgresSchema() {
  const people = pgTable('people', {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    active: postgresBoolean('active').notNull(),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
  });
  const pets = pgTable('pets', {
    id: serial('id').primaryKey(),
    ownerId: integer('owner_id').notNull(),
    name: text('name').notNull(),
    species: text('species').notNull(),
    adopted: postgresBoolean('adopted').notNull(),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
  });

  return {
    people,
    pets,
  };
}

function createMySqlSchema() {
  const people = mysqlTable('people', {
    id: int('id').autoincrement().primaryKey(),
    email: varchar('email', { length: 191 }).notNull(),
    name: varchar('name', { length: 191 }).notNull(),
    active: mysqlBoolean('active').notNull(),
    createdAt: datetime('created_at', {
      mode: 'date',
      fsp: 3,
    }).notNull(),
  });
  const pets = mysqlTable('pets', {
    id: int('id').autoincrement().primaryKey(),
    ownerId: int('owner_id').notNull(),
    name: varchar('name', { length: 191 }).notNull(),
    species: varchar('species', { length: 80 }).notNull(),
    adopted: mysqlBoolean('adopted').notNull(),
    createdAt: datetime('created_at', {
      mode: 'date',
      fsp: 3,
    }).notNull(),
  });

  return {
    people,
    pets,
  };
}

function createDrizzleRecord(orm, dialect, db, schema, close) {
  const {
    people,
    pets,
  } = schema;

  return {
    orm,
    dialect,
    name: `${orm}-${dialect}`,
    close,
    async findPersonById(id) {
      const rows = await db
        .select()
        .from(people)
        .where(eq(people.id, id))
        .limit(1);

      return rows[0] ?? null;
    },
    async findPersonWithPets(id) {
      const personRows = await db
        .select()
        .from(people)
        .where(eq(people.id, id))
        .limit(1);
      const person = personRows[0];

      if (!person) {
        return null;
      }

      const petRows = await db
        .select()
        .from(pets)
        .where(eq(pets.ownerId, id))
        .orderBy(asc(pets.id));

      return {
        ...person,
        pets: petRows,
      };
    },
    listPeoplePage(limit, offset) {
      return db
        .select()
        .from(people)
        .orderBy(asc(people.id))
        .limit(limit)
        .offset(offset);
    },
    async countActivePeople() {
      const rows = await db
        .select({
          count: sql`count(*)`,
        })
        .from(people)
        .where(eq(people.active, true));

      return rows[0] ?? {
        count: 0,
      };
    },
    updatePersonActive(id, active) {
      return db
        .update(people)
        .set({
          active,
        })
        .where(eq(people.id, id));
    },
    transactionReadWrite(id, active) {
      return db.transaction(async (transaction) => {
        await transaction
          .select()
          .from(people)
          .where(eq(people.id, id))
          .limit(1);
        await transaction
          .select({
            count: sql`count(*)`,
          })
          .from(pets)
          .where(eq(pets.ownerId, id));

        return transaction
          .update(people)
          .set({
            active,
          })
          .where(eq(people.id, id));
      });
    },
    transactionBeginCommit() {
      return db.transaction(async () => undefined);
    },
    async transactionBeginRollback() {
      try {
        await db.transaction(async () => {
          throw new Error(TX_ROLLBACK_SENTINEL);
        });
      } catch (error) {
        if (error?.message === TX_ROLLBACK_SENTINEL) {
          return;
        }

        throw error;
      }
    },
  };
}

export async function createDrizzleAdapter(dialect, config) {
  if (dialect === 'postgres') {
    const pool = new Pool({
      connectionString: config.postgresUrl,
    });
    const schema = createPostgresSchema();
    const db = drizzlePostgres(pool, {
      schema,
    });

    return createDrizzleRecord('drizzle', dialect, db, schema, () => pool.end());
  }

  if (dialect === 'mysql') {
    const pool = mysql.createPool(createMySqlConnectionOptions(config.mysqlUrl));
    const schema = createMySqlSchema();
    const db = drizzleMySql(pool, {
      mode: 'default',
      schema,
    });

    return createDrizzleRecord('drizzle', dialect, db, schema, () => pool.end());
  }

  throw new Error(`Drizzle adapter does not support dialect "${dialect}".`);
}
