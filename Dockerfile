FROM nodered/node-red:5

USER root
RUN npm install -g nodemon@3
USER node-red
