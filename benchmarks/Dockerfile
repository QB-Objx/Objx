FROM node:24-bookworm-slim

WORKDIR /workspace

COPY . .

RUN npm ci \
  && npm --prefix benchmarks ci \
  && npm run build \
  && npm --prefix benchmarks run prisma:generate

WORKDIR /workspace/benchmarks

CMD ["npm", "run", "benchmark:container"]
