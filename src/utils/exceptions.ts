export class EntityNotFoundError extends Error {
    constructor(entityName: string, entityId: string | number) {
        super(`${entityName} with ID ${entityId} not found.`);
        this.name = 'EntityNotFoundError';
    }
}