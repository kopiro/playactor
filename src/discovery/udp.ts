import _debug from "debug";
import dgram from "dgram";

import { DiscoveryVersion, formatDiscoveryMessage } from "../protocol";

import {
    IDiscoveryNetwork,
    IDiscoveryNetworkFactory,
    INetworkConfig,
    OnDeviceDiscoveredHandler,
} from "./model";

const debug = _debug("playground:discovery:udp");

const BROADCAST_ADDRESS = "255.255.255.255";

interface IManagedSocket {
    socket: dgram.Socket;
    references: number;
}

class UdpSocketManager {
    private readonly sockets: {[key: number]: IManagedSocket} = {};

    public acquire(port: number) {
        debug("acquire @", port);

        const existing = this.sockets[port];
        if (existing) {
            ++existing.references;
            return { socket: existing.socket };
        }

        const managed = {
            socket: dgram.createSocket("udp4"),
            references: 1,
        };
        this.sockets[port] = managed;

        return {
            socket: managed.socket,
            isNew: true,
        };
    }

    public release(port: number) {
        debug("release @", port);

        const managed = this.sockets[port];
        if (!managed) {
            throw new Error("Unbalanced release()");
        }

        const remainingReferences = --managed.references;
        if (!remainingReferences) {
            delete this.sockets[port];
            managed.socket.close();
        }
    }
}

export class UdpDiscoveryNetwork implements IDiscoveryNetwork {
    constructor(
        private readonly socketManager: UdpSocketManager,
        private readonly boundPort: number,
        private readonly socket: dgram.Socket,
        private readonly port: number,
        private readonly version: DiscoveryVersion,
    ) {}

    public close() {
        debug("closing udp network");
        this.socketManager.release(this.boundPort);
    }

    public async ping() {
        const message = formatDiscoveryMessage({
            type: "SRCH",
            version: this.version,
        });

        debug("broadcast ping:", message);
        this.socket.send(message, this.port, BROADCAST_ADDRESS);
    }
}

const singletonUdpSocketManager = new UdpSocketManager();

export class UdpDiscoveryNetworkFactory implements IDiscoveryNetworkFactory {
    constructor(
        private readonly port: number,
        private readonly version: DiscoveryVersion,
        private readonly socketManager: UdpSocketManager = singletonUdpSocketManager,
    ) {}

    public create(
        config: INetworkConfig,
        onDevice: OnDeviceDiscoveredHandler,
    ) {
        const bindPort = config.localBindPort ?? 0;
        const { socket, isNew } = this.socketManager.acquire(bindPort);

        socket.on("message", (message, rinfo) => {
            onDevice({
                address: rinfo.address,
                discoveryVersion: this.version,
                id: "", // TODO
                status: "Standby", // TODO
            });
        });

        if (isNew) {
            debug("created new socket for ", config);
            socket.on("listening", () => {
                debug("listening on ", socket.address());
            });

            socket.bind(config.localBindPort, config.localBindAddress, () => {
                socket.setBroadcast(true);
            });
        } else {
            debug("joining existing socket for ", config);
        }

        return new UdpDiscoveryNetwork(
            this.socketManager,
            bindPort,
            socket,
            this.port,
            this.version,
        );
    }
}
