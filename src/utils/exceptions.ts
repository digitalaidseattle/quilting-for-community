export class DatabaseError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'DatabaseError';
    }
}

export class EntityNotFoundError extends Error {
    constructor(entityName: string, entityId: string | number) {
        super(`${entityName} with ID ${entityId} not found.`);
        this.name = 'EntityNotFoundError';
    }
}