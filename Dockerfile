FROM ubuntu:jammy

# add basic utils
RUN apt-get update
RUN apt-get install -y curl git inotify-tools ca-certificates gnupg

# add nodejs
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
RUN apt-get update
RUN apt-get install -y nodejs

RUN mkdir /out
VOLUME /out

RUN useradd -m ubuntu
RUN chown ubuntu:ubuntu /out
USER ubuntu

WORKDIR /app
COPY --chown=ubuntu:ubuntu ./ ./
RUN npm install

ENV ENABLE_OPTIMIZER=1
RUN npx hardhat compile


ENV ADDRESSES_FILE=/out/addresses.json
ENV ABI_DIR=/out/abis/

EXPOSE 8545
CMD node scripts/deploy/start.js
