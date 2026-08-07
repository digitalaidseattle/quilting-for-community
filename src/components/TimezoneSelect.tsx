import { MenuItem, TextField, TextFieldProps } from "@mui/material";
import { useTimezoneOptions } from "../hooks/useTimezoneOptions";

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
}: TimezoneSelectProps) => {
    const { options, loading } = useTimezoneOptions();

    return (
        <TextField
            select
            label="Timezone"
            value={options.some((option) => option.value === value) ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            size={size}
            fullWidth={fullWidth}
            disabled={loading || options.length === 0}
            sx={fullWidth ? undefined : { minWidth: 220 }}
        >
            {options.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                    {option.label}
                </MenuItem>
            ))}
        </TextField>
    );
};
