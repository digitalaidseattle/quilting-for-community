/**
 *  MemberRegistrationDialog.tsx
 *
 *  @copyright 2026 Digital Aid Seattle
 */

import { useContext, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Button,
    Stack,
    Alert,
    Autocomplete,
    CircularProgress,
} from "@mui/material";
import { LoadingContext } from "@digitalaidseattle/core";
import { RegisterMemberInput, AdminMembersService } from "../../services/members/AdminMembersService";

export type MemberRegistrationDialogProps = {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
};

const AVAILABLE_ROLES = [
    { label: 'Member', value: 'member' },
    { label: 'Volunteer', value: 'volunteer' },
    { label: 'Instructor', value: 'instructor' },
    { label: 'Admin', value: 'admin' },
];

export const MemberRegistrationDialog = ({
    open,
    onClose,
    onSuccess,
}: MemberRegistrationDialogProps) => {
    const adminMembersService = AdminMembersService.getInstance();
    const { setLoading } = useContext(LoadingContext);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const {
        control,
        handleSubmit,
        reset,
        watch,
        formState: { errors },
    } = useForm<RegisterMemberInput>({
        defaultValues: {
            email: '',
            first_name: '',
            last_name: '',
            phone: '',
            roles: [],
        },
    });

    const roles = watch('roles') || [];

    const handleClose = () => {
        reset();
        setError(null);
        onClose();
    };

    const onSubmit = async (data: RegisterMemberInput) => {
        setError(null);
        setIsSubmitting(true);
        setLoading(true);

        try {
            // Validate email format
            if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
                setError('Please enter a valid email address');
                return;
            }

            // Check if email already exists
            const exists = await adminMembersService.emailExists(data.email);
            if (exists) {
                setError('This email is already registered');
                return;
            }

            // Register the member
            await adminMembersService.registerMember(data);

            // Show success and reset form
            reset();
            setError(null);
            handleClose();
            onSuccess();
        } catch (err) {
            console.error('Error registering member:', err);
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to register member. Please try again.'
            );
        } finally {
            setIsSubmitting(false);
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>Register New Member</DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                <Stack spacing={2}>
                    {error && <Alert severity="error">{error}</Alert>}

                    <Controller
                        name="email"
                        control={control}
                        rules={{
                            required: 'Email is required',
                            pattern: {
                                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                                message: 'Please enter a valid email address',
                            },
                        }}
                        render={({ field }) => (
                            <TextField
                                {...field}
                                label="Email *"
                                type="email"
                                placeholder="member@example.com"
                                error={!!errors.email}
                                helperText={errors.email?.message}
                                fullWidth
                                disabled={isSubmitting}
                            />
                        )}
                    />

                    <Controller
                        name="first_name"
                        control={control}
                        render={({ field }) => (
                            <TextField
                                {...field}
                                label="First Name"
                                placeholder="John"
                                error={!!errors.first_name}
                                helperText={errors.first_name?.message}
                                fullWidth
                                disabled={isSubmitting}
                            />
                        )}
                    />

                    <Controller
                        name="last_name"
                        control={control}
                        render={({ field }) => (
                            <TextField
                                {...field}
                                label="Last Name"
                                placeholder="Doe"
                                error={!!errors.last_name}
                                helperText={errors.last_name?.message}
                                fullWidth
                                disabled={isSubmitting}
                            />
                        )}
                    />

                    <Controller
                        name="phone"
                        control={control}
                        render={({ field }) => (
                            <TextField
                                {...field}
                                label="Phone"
                                placeholder="(555) 123-4567"
                                error={!!errors.phone}
                                helperText={errors.phone?.message}
                                fullWidth
                                disabled={isSubmitting}
                            />
                        )}
                    />

                    <Controller
                        name="roles"
                        control={control}
                        render={({ field }) => (
                            <Autocomplete
                                {...field}
                                multiple
                                options={AVAILABLE_ROLES}
                                getOptionLabel={(option) =>
                                    typeof option === 'string' ? option : option.label
                                }
                                filterSelectedOptions
                                value={roles}
                                onChange={(event, value) => {
                                    field.onChange(value.map((v) => (typeof v === 'string' ? v : v.value)));
                                }}
                                disabled={isSubmitting}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Roles"
                                        placeholder="Select roles"
                                        error={!!errors.roles}
                                        helperText={errors.roles?.message}
                                    />
                                )}
                            />
                        )}
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={handleClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button
                    onClick={handleSubmit(onSubmit)}
                    variant="contained"
                    disabled={isSubmitting}
                    startIcon={isSubmitting ? <CircularProgress size={20} /> : undefined}
                >
                    {isSubmitting ? 'Registering...' : 'Register'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
