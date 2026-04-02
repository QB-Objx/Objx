const SPECIES = ['dog', 'cat', 'bird', 'hamster'];

export function createSeedRows(config) {
  const people = [];
  const pets = [];
  const isoDate = '2026-04-02T12:00:00.000Z';
  let petId = 1;

  for (let personId = 1; personId <= config.people; personId += 1) {
    people.push({
      id: personId,
      email: `person${personId}@bench.dev`,
      name: `Person ${personId}`,
      active: personId % 2 === 0,
      createdAt: isoDate,
    });

    for (let petIndex = 0; petIndex < config.petsPerPerson; petIndex += 1) {
      pets.push({
        id: petId,
        ownerId: personId,
        name: `Pet ${petId}`,
        species: SPECIES[petId % SPECIES.length],
        adopted: petId % 3 === 0,
        createdAt: isoDate,
      });
      petId += 1;
    }
  }

  return {
    people,
    pets,
  };
}

export function chunkArray(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

export function formatMySqlDateTime(value) {
  return value.replace('T', ' ').replace('Z', '');
}
