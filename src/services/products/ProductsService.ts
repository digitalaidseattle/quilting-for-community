import { DataAccessOptions, Identifier, PageInfo, QueryModel } from "@digitalaidseattle/core";
import { ProductHistoryService } from "./ProductHistoryService";
import { ProductsEntityService } from "./ProductsEntityService";
import { PriceChange, Product, ProductHistory } from "./types";

// Handles products; price history is an append-only log, exposed via recordPriceChange/
// getPriceHistory/getCurrentPrice rather than as a writable nested collection.
export class ProductsService {
    private static instance: ProductsService;

    static getInstance() {
        if (!ProductsService.instance) {
            ProductsService.instance = new ProductsService();
        }
        return ProductsService.instance;
    }

    constructor(
        private readonly products = ProductsEntityService.getInstance(),
        private readonly history = ProductHistoryService.getInstance(),
    ) { }

    find(query: QueryModel, opts?: DataAccessOptions<Product>): Promise<PageInfo<Product>> {
        return this.products.find(query, opts);
    }

    getById(id: Identifier): Promise<Product | null> {
        return this.products.getById(id);
    }

    // Persists product fields only. product_history is never written through this method:
    // use recordPriceChange to append a price change.
    async save(product: Product): Promise<Product> {
        const saved = product.id
            ? await this.products.update(product.id, product)
            : await this.products.insert(product);

        const refreshed = await this.getById(saved.id as Identifier);
        if (!refreshed) {
            throw new Error(`Product not found after save: ${saved.id}`);
        }
        return refreshed;
    }

    // Appends a price-history row for the product. Never edits or removes prior rows.
    async recordPriceChange(productId: Identifier, change: PriceChange): Promise<ProductHistory> {
        const newHistory = await this.history.insert({
            product_id: productId as string,
            change_date: new Date().toISOString(),
            regular_price: change.regular_price,
            sale_price: change.sale_price == null ? null : change.sale_price,
        } as ProductHistory);

        return newHistory;
    }

    async getCurrentPrice(id: Identifier): Promise<ProductHistory | null> {
        return this.history.getCurrentPrice(id as string);
    }

    async getPriceHistory(id: Identifier, limit?: number): Promise<ProductHistory[]> {
        return this.history.getByProductId(id as string, { limit });
    }

    async delete(id: Identifier): Promise<void> {
        return this.products.delete(id);
    }
}
