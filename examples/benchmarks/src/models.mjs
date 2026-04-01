import {
  col,
  defineModel,
  hasMany,
} from '../../../packages/core/dist/index.js';

export const Pet = defineModel({
  name: 'Pet',
  table: 'pets',
  columns: {
    id: col.int().primary(),
    ownerId: col.int(),
    name: col.text(),
    status: col.text(),
  },
});

export const Person = defineModel({
  name: 'Person',
  table: 'people',
  columns: {
    id: col.int().primary(),
    name: col.text(),
    active: col.boolean(),
    createdAt: col.timestamp(),
  },
  relations: (person) => ({
    pets: hasMany(() => Pet, {
      from: person.columns.id,
      to: Pet.columns.ownerId,
    }),
  }),
});
