import knexFactory from 'knex';

function createClientName(dialect) {
  return dialect === 'postgres' ? 'pg' : 'mysql2';
}

export async function createKnexAdapter(dialect, config) {
  const knex = knexFactory({
    client: createClientName(dialect),
    connection: dialect === 'postgres' ? config.postgresUrl : config.mysqlUrl,
    pool: {
      min: 0,
      max: 10,
    },
  });

  return {
    orm: 'knex',
    dialect,
    name: `knex-${dialect}`,
    close() {
      return knex.destroy();
    },
    findPersonById(id) {
      return knex('people').where({ id }).first();
    },
    async findPersonWithPets(id) {
      const person = await knex('people').where({ id }).first();

      if (!person) {
        return null;
      }

      const pets = await knex('pets').where({ owner_id: id }).orderBy('id', 'asc');

      return {
        ...person,
        pets,
      };
    },
    listPeoplePage(limit, offset) {
      return knex('people').orderBy('id', 'asc').limit(limit).offset(offset);
    },
    countActivePeople() {
      return knex('people').where({ active: true }).count({ count: '*' }).first();
    },
    updatePersonActive(id, active) {
      return knex('people').where({ id }).update({ active });
    },
    transactionReadWrite(id, active) {
      return knex.transaction(async (trx) => {
        await trx('people').where({ id }).first();
        await trx('pets').where({ owner_id: id }).count({ count: '*' }).first();
        return trx('people').where({ id }).update({ active });
      });
    },
  };
}
