import { SupabaseConfiguration, SupabaseDAO } from "@digitalaidseattle/supabase";
import { ProductHistory } from "./types";

export class ProductHistoryDao extends SupabaseDAO<ProductHistory> {
    private static instance: ProductHistoryDao;

    static getInstance() {
        if (!ProductHistoryDao.instance) {
            ProductHistoryDao.instance = new ProductHistoryDao(
                SupabaseConfiguration.getInstance().getSupabaseClient(),
                'product_history'
            );
        }
        return ProductHistoryDao.instance;
    }

    // Price history for a product, most recent first. Pass opts.limit to cap the result.
    async getByProductId(productId: string, opts?: { limit?: number }): Promise<ProductHistory[]> {
        let query = this.client
            .from(this.tableName)
            .select(this.select)
            .eq('product_id', productId)
            .order('change_date', { ascending: false });

        if (opts?.limit) {
            query = query.limit(opts.limit);
        }

        const { data, error } = await query;

        if (error) {
            throw error;
        }

        return (data ?? []).map((row) => this.mapJson(row));
    }

    // The current price is the most recent history row for the product.
    async getCurrentPrice(productId: string): Promise<ProductHistory | null> {
        const [latest] = await this.getByProductId(productId, { limit: 1 });
        return latest ?? null;
    }
}
