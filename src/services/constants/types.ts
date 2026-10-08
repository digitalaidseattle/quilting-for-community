import { Entity } from "@digitalaidseattle/core";

export const TIMEZONE_CONSTANT_TYPE = "timezone";
export const EVENT_CATEGORY_CONSTANT_TYPE = "event-category";
export const PRODUCT_CATEGORY_CONSTANT_TYPE = "product-category";
export const PRODUCT_STATUS_CONSTANT_TYPE = "product-status";

export type AppConstant = Entity & {
    type: string;
    value: string;
    label: string;
};

export type ConstantOption = {
    value: string;
    label: string;
};

export type TimezoneOption = ConstantOption;
export type EventCategoryOption = ConstantOption;
