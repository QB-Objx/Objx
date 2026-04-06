import 'reflect-metadata';

import {
  DataSource,
  EntitySchema,
} from 'typeorm';

const TX_ROLLBACK_SENTINEL = 'objx-benchmark-rollback';

function createTypeOrmEntities(dialect) {
  const stringColumn =
    dialect === 'postgres'
      ? {
          type: 'text',
        }
      : {
          type: 'varchar',
          length: 191,
        };
  const timestampColumn =
    dialect === 'postgres'
      ? {
          type: 'timestamptz',
        }
      : {
          type: 'datetime',
          precision: 3,
        };

  const Person = new EntitySchema({
    name: 'BenchmarkPerson',
    tableName: 'people',
    columns: {
      id: {
        type: Number,
        primary: true,
      },
      email: {
        ...stringColumn,
      },
      name: {
        ...stringColumn,
      },
      active: {
        type: Boolean,
      },
      createdAt: {
        ...timestampColumn,
        name: 'created_at',
      },
    },
    relations: {
      pets: {
        type: 'one-to-many',
        target: 'BenchmarkPet',
        inverseSide: 'owner',
      },
    },
  });

  const Pet = new EntitySchema({
    name: 'BenchmarkPet',
    tableName: 'pets',
    columns: {
      id: {
        type: Number,
        primary: true,
      },
      ownerId: {
        type: Number,
        name: 'owner_id',
      },
      name: {
        ...stringColumn,
      },
      species:
        dialect === 'postgres'
          ? {
              type: 'text',
            }
          : {
              type: 'varchar',
              length: 80,
            },
      adopted: {
        type: Boolean,
      },
      createdAt: {
        ...timestampColumn,
        name: 'created_at',
      },
    },
    relations: {
      owner: {
        type: 'many-to-one',
        target: 'BenchmarkPerson',
        inverseSide: 'pets',
        joinColumn: {
          name: 'owner_id',
        },
      },
    },
  });

  return {
    Person,
    Pet,
  };
}

function createDataSource(dialect, config) {
  const {
    Person,
    Pet,
  } = createTypeOrmEntities(dialect);

  return {
    dataSource: new DataSource({
      type: dialect,
      url: dialect === 'postgres' ? config.postgresUrl : config.mysqlUrl,
      logging: false,
      synchronize: false,
      entities: [Person, Pet],
    }),
    Person,
    Pet,
  };
}

export async function createTypeOrmAdapter(dialect, config) {
  if (dialect !== 'postgres' && dialect !== 'mysql') {
    throw new Error(`TypeORM adapter does not support dialect "${dialect}".`);
  }

  const {
    dataSource,
    Person,
    Pet,
  } = createDataSource(dialect, config);
  await dataSource.initialize();
  const personRepository = dataSource.getRepository(Person);

  return {
    orm: 'typeorm',
    dialect,
    name: `typeorm-${dialect}`,
    close() {
      return dataSource.destroy();
    },
    findPersonById(id) {
      return personRepository.findOneBy({
        id,
      });
    },
    findPersonWithPets(id) {
      return personRepository
        .createQueryBuilder('person')
        .leftJoinAndSelect('person.pets', 'pet')
        .where('person.id = :id', {
          id,
        })
        .orderBy('pet.id', 'ASC')
        .getOne();
    },
    listPeoplePage(limit, offset) {
      return personRepository.find({
        order: {
          id: 'ASC',
        },
        take: limit,
        skip: offset,
      });
    },
    countActivePeople() {
      return personRepository.countBy({
        active: true,
      });
    },
    updatePersonActive(id, active) {
      return personRepository.update(
        {
          id,
        },
        {
          active,
        },
      );
    },
    transactionReadWrite(id, active) {
      return dataSource.transaction(async (manager) => {
        await manager.getRepository(Person).findOneBy({
          id,
        });
        await manager.getRepository(Pet).countBy({
          ownerId: id,
        });

        return manager.getRepository(Person).update(
          {
            id,
          },
          {
            active,
          },
        );
      });
    },
    transactionBeginCommit() {
      return dataSource.transaction(async () => undefined);
    },
    async transactionBeginRollback() {
      try {
        await dataSource.transaction(async () => {
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
