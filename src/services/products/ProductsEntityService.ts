import { DataAccessOptions, PageInfo, QueryModel } from "@digitalaidseattle/core";
import { QueryEntityService, SupabaseEntityService } from "../EntityService";
import { ProductsDao } from "./ProductsDao";
import { Product } from "./types";

export class ProductsEntityService
    extends SupabaseEntityService<Product>
    implements QueryEntityService<Product> {

    private static instance: ProductsEntityService;

    static getInstance() {
        if (!ProductsEntityService.instance) {
            ProductsEntityService.instance = new ProductsEntityService(ProductsDao.getInstance());
        }
        return ProductsEntityService.instance;
    }

    find(query: QueryModel, opts?: DataAccessOptions<Product>): Promise<PageInfo<Product>> {
        return this.dao.find(query, opts);
    }
}
