import {
  DataTypes,
  Sequelize,
} from 'sequelize';

const TX_ROLLBACK_SENTINEL = 'objx-benchmark-rollback';

function resolveSequelizeConfig(dialect, config) {
  if (dialect === 'postgres') {
    return {
      url: config.postgresUrl,
      dialect: 'postgres',
    };
  }

  if (dialect === 'mysql') {
    return {
      url: config.mysqlUrl,
      dialect: 'mysql',
    };
  }

  throw new Error(`Sequelize adapter does not support dialect "${dialect}".`);
}

export async function createSequelizeAdapter(dialect, config) {
  const resolved = resolveSequelizeConfig(dialect, config);
  const sequelize = new Sequelize(resolved.url, {
    dialect: resolved.dialect,
    logging: false,
  });

  const Person = sequelize.define(
    'Person',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
      },
      email: {
        type: DataTypes.STRING,
      },
      name: {
        type: DataTypes.STRING,
      },
      active: {
        type: DataTypes.BOOLEAN,
      },
      createdAt: {
        field: 'created_at',
        type: DataTypes.DATE,
      },
    },
    {
      tableName: 'people',
      timestamps: false,
    },
  );

  const Pet = sequelize.define(
    'Pet',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
      },
      ownerId: {
        field: 'owner_id',
        type: DataTypes.INTEGER,
      },
      name: {
        type: DataTypes.STRING,
      },
      species: {
        type: DataTypes.STRING,
      },
      adopted: {
        type: DataTypes.BOOLEAN,
      },
      createdAt: {
        field: 'created_at',
        type: DataTypes.DATE,
      },
    },
    {
      tableName: 'pets',
      timestamps: false,
    },
  );

  Person.hasMany(Pet, {
    foreignKey: 'ownerId',
    as: 'pets',
  });
  Pet.belongsTo(Person, {
    foreignKey: 'ownerId',
    as: 'owner',
  });

  await sequelize.authenticate();

  return {
    orm: 'sequelize',
    dialect,
    name: `sequelize-${dialect}`,
    close() {
      return sequelize.close();
    },
    findPersonById(id) {
      return Person.findByPk(id);
    },
    findPersonWithPets(id) {
      return Person.findByPk(id, {
        include: [
          {
            model: Pet,
            as: 'pets',
          },
        ],
      });
    },
    listPeoplePage(limit, offset) {
      return Person.findAll({
        order: [['id', 'ASC']],
        limit,
        offset,
      });
    },
    countActivePeople() {
      return Person.count({
        where: {
          active: true,
        },
      });
    },
    updatePersonActive(id, active) {
      return Person.update(
        {
          active,
        },
        {
          where: {
            id,
          },
        },
      );
    },
    transactionReadWrite(id, active) {
      return sequelize.transaction(async (transaction) => {
        await Person.findByPk(id, {
          transaction,
        });
        await Pet.count({
          where: {
            ownerId: id,
          },
          transaction,
        });
        return Person.update(
          {
            active,
          },
          {
            where: {
              id,
            },
            transaction,
          },
        );
      });
    },
    transactionBeginCommit() {
      return sequelize.transaction(async () => undefined);
    },
    async transactionBeginRollback() {
      try {
        await sequelize.transaction(async () => {
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
