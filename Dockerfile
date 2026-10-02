FROM node:lts

WORKDIR /app

RUN curl -sfS https://dotenvx.sh/install.sh | sh

COPY package*.json ./
RUN npm ci

COPY . .

ARG PORT=3000
EXPOSE $PORT

CMD ["dotenvx", "run", "--", "node", "main.js"]
