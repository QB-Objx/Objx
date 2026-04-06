function resolveClientModulePath(dialect) {
  if (dialect === 'postgres') {
    return new URL('../../generated/prisma-postgres/index.js', import.meta.url);
  }

  if (dialect === 'mysql') {
    return new URL('../../generated/prisma-mysql/index.js', import.meta.url);
  }

  throw new Error(`Prisma adapter does not support dialect "${dialect}".`);
}

export async function createPrismaAdapter(dialect) {
  let PrismaClient;

  try {
    ({ PrismaClient } = await import(resolveClientModulePath(dialect).href));
  } catch (error) {
    throw new Error(
      `Prisma client for "${dialect}" is missing. Run "npm run prisma:generate" first.`,
      {
        cause: error,
      },
    );
  }

  const prisma = new PrismaClient();
  await prisma.$connect();

  return {
    orm: 'prisma',
    dialect,
    name: `prisma-${dialect}`,
    close() {
      return prisma.$disconnect();
    },
    findPersonById(id) {
      return prisma.person.findUnique({
        where: {
          id,
        },
      });
    },
    findPersonWithPets(id) {
      return prisma.person.findUnique({
        where: {
          id,
        },
        include: {
          pets: {
            orderBy: {
              id: 'asc',
            },
          },
        },
      });
    },
    listPeoplePage(limit, offset) {
      return prisma.person.findMany({
        orderBy: {
          id: 'asc',
        },
        take: limit,
        skip: offset,
      });
    },
    countActivePeople() {
      return prisma.person.count({
        where: {
          active: true,
        },
      });
    },
    updatePersonActive(id, active) {
      return prisma.person.update({
        where: {
          id,
        },
        data: {
          active,
        },
      });
    },
    transactionReadWrite(id, active) {
      return prisma.$transaction(async (transaction) => {
        await transaction.person.findUnique({
          where: {
            id,
          },
        });
        await transaction.pet.count({
          where: {
            ownerId: id,
          },
        });
        return transaction.person.update({
          where: {
            id,
          },
          data: {
            active,
          },
        });
      });
    },
  };
}
