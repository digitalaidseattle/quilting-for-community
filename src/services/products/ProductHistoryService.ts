import { PageInfo, QueryModel } from "@digitalaidseattle/core";
import { QueryEntityService, SupabaseEntityService } from "../EntityService";
import { ProductHistoryDao } from "./ProductHistoryDao";
import { ProductHistory } from "./types";

export class ProductHistoryService
    extends SupabaseEntityService<ProductHistory>
    implements QueryEntityService<ProductHistory> {

    private static instance: ProductHistoryService;

    static getInstance() {
        if (!ProductHistoryService.instance) {
            ProductHistoryService.instance = new ProductHistoryService(ProductHistoryDao.getInstance());
        }
        return ProductHistoryService.instance;
    }

    find(query: QueryModel): Promise<PageInfo<ProductHistory>> {
        return this.dao.find(query);
    }

    getByProductId(productId: string, opts?: { limit?: number }): Promise<ProductHistory[]> {
        return ProductHistoryDao.getInstance().getByProductId(productId, opts);
    }

    getCurrentPrice(productId: string): Promise<ProductHistory | null> {
        return ProductHistoryDao.getInstance().getCurrentPrice(productId);
    }
}
