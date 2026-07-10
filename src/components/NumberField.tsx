import { useEffect, useState } from "react";
import { TextField, TextFieldProps } from "@mui/material";

type NumberFieldProps = Omit<TextFieldProps, 'value' | 'onChange' | 'type'> & {
    value: number;
    onChange: (value: number) => void;
};

// Handles empty fields and leading zeros. Only valid numbers are saved.
export const NumberField = ({ value, onChange, ...props }: NumberFieldProps) => {
    const [text, setText] = useState(String(value));
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) {
            setText(String(value));
        }
    }, [value, focused]);

    return (
        <TextField
            {...props}
            type="number"
            value={text}
            onFocus={(e) => {
                setFocused(true);
                props.onFocus?.(e);
            }}
            onBlur={(e) => {
                setFocused(false);
                props.onBlur?.(e);
            }}
            onChange={(e) => {
                const raw = e.target.value;
                setText(raw);
                const parsed = Number(raw);
                if (raw.trim() !== '' && !Number.isNaN(parsed)) {
                    onChange(parsed);
                }
            }}
        />
    );
};
