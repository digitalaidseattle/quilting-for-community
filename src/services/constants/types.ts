import { Entity } from "@digitalaidseattle/core";

export const TIMEZONE_CONSTANT_TYPE = "timezone";

export type AppConstant = Entity & {
    type: string;
    value: string;
    label: string;
};

export type TimezoneOption = {
    value: string;
    label: string;
};
