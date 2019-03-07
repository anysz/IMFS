FROM node:latest

#ENV PORT 3030

# Create app repo
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install dependencies
COPY package.json /usr/src/app/
CMD npm install

# Copy application
COPY . /usr/src/app

EXPOSE 3030
