import { Modification } from './Modification';

export enum SenderId {
    Admin = 'a'.charCodeAt(0),
    Server = 'r'.charCodeAt(0),
    Student = 's'.charCodeAt(0),
    Tutor = 't'.charCodeAt(0)
}

export interface Update {
    seq: number;
    senderId: SenderId;
    data: Modification;
}

export interface UpdateMessage {
    index: number;
    update: Update;
}
