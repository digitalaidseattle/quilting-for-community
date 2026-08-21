import { MenuItem, TextField, TextFieldProps } from "@mui/material";
import { useEventCategoryOptions } from "../hooks/useEventCategoryOptions";

type EventCategorySelectProps = {
    value: string;
    onChange: (category: string) => void;
    size?: TextFieldProps["size"];
    sx?: TextFieldProps["sx"];
};

export const EventCategorySelect = ({
    value,
    onChange,
    size = "medium",
    sx,
}: EventCategorySelectProps) => {
    const { options, loading } = useEventCategoryOptions();
    const knownValue = options.some((option) => option.value === value);

    return (
        <TextField
            select
            label="Category"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            size={size}
            disabled={loading || options.length === 0}
            sx={sx}
        >
            {!value && <MenuItem value="">Select a category</MenuItem>}
            {value && !knownValue && (
                <MenuItem value={value}>{value}</MenuItem>
            )}
            {options.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                    {option.label}
                </MenuItem>
            ))}
        </TextField>
    );
};
