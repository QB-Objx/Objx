import {
  col,
  defineModel,
  hasMany,
} from '../../../../packages/core/dist/index.js';

export const Pet = defineModel({
  name: 'Pet',
  table: 'pets',
  columns: {
    id: col.int().primary(),
    owner_id: col.int(),
    name: col.text(),
    species: col.text(),
    adopted: col.boolean(),
    created_at: col.timestamp(),
  },
});

export const Person = defineModel({
  name: 'Person',
  table: 'people',
  columns: {
    id: col.int().primary(),
    email: col.text(),
    name: col.text(),
    active: col.boolean(),
    created_at: col.timestamp(),
  },
  relations: (person) => ({
    pets: hasMany(() => Pet, {
      from: person.columns.id,
      to: Pet.columns.owner_id,
    }),
  }),
});
