import { Entity } from "@digitalaidseattle/core";

export type Product = Entity & {
    // Category stored in constants table
    category: string;
    name: string;
    description: string;
    // Stock Keeping Unit (unique ID for each product)
    sku: string;
    options: Record<string, unknown>;
    images: string[];
    // Status stored in constants table
    status: string;
};

export type ProductHistory = Entity & {
    product_id: string;
    change_date: string;
    sale_price: number | null;
    regular_price: number;
};

export type PriceChange = {
    regular_price: number;
    sale_price?: number | null;
};
