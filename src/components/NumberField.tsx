import { useEffect, useState } from "react";
import { TextField, TextFieldProps } from "@mui/material";

type NumberFieldProps = Omit<TextFieldProps, 'value' | 'onChange' | 'type'> & {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
};

// Handles empty fields and leading zeros. Only valid numbers are saved.
export const NumberField = ({
    value,
    onChange,
    min,
    max,
    inputProps,
    slotProps,
    InputProps,
    ...props
}: NumberFieldProps) => {
    const [text, setText] = useState(String(value));
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) {
            setTimeout(() => {
                setText(String(value));
            }, 0);
        }
    }, [value, focused]);

    const incomingInputSlot =
        slotProps && typeof slotProps.input === 'object' && slotProps.input !== null
            ? slotProps.input
            : undefined;

    return (
        <TextField
            {...props}
            type="number"
            value={text}
            InputProps={InputProps}
            slotProps={{
                ...slotProps,
                htmlInput: {
                    min,
                    max,
                    ...inputProps,
                    ...(typeof slotProps?.htmlInput === 'object' && slotProps.htmlInput !== null
                        ? slotProps.htmlInput
                        : undefined),
                },
                input: {
                    ...incomingInputSlot,
                    ...InputProps,
                },
            }}
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
