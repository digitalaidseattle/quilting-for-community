import { MenuItem, TextField, TextFieldProps } from "@mui/material";
import { TIMEZONE_OPTIONS } from "../utils/date-format";

type TimezoneSelectProps = {
    value: string;
    onChange: (timeZone: string) => void;
    size?: TextFieldProps["size"];
    fullWidth?: boolean;
};

export const TimezoneSelect = ({
    value,
    onChange,
    size = "small",
    fullWidth = false,
}: TimezoneSelectProps) => (
    <TextField
        select
        label="Timezone"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        size={size}
        fullWidth={fullWidth}
        sx={fullWidth ? undefined : { minWidth: 220 }}
    >
        {TIMEZONE_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
                {option.label}
            </MenuItem>
        ))}
    </TextField>
);
