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
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    FormControlLabel,
    Checkbox,
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
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [selectedExisting, setSelectedExisting] = useState<any | null>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const canCreateNew = hasSearched && !selectedExisting && searchResults.length === 0;

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
            waiver_accepted: false,
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
            if (!hasSearched) {
                setError('Search for an existing member before creating a new participant record.');
                return;
            }

            if (selectedExisting) {
                setError('An existing participant is selected.');
                return;
            }

            if (searchResults.length > 0) {
                setError('A matching participant already exists.');
                return;
            }

            // Validate name (at least one of first or last name)
            if (!data.first_name && !data.last_name) {
                setError('Please provide the participant\'s name (first or last name).');
                return;
            }

            // Require exactly one of email or phone, but not both.
            const trimmedEmail = data.email?.trim() ?? '';
            const trimmedPhone = data.phone?.trim() ?? '';

            if (!trimmedEmail && !trimmedPhone) {
                setError('Please provide either an email or a phone number.');
                return;
            }

            if (trimmedEmail && trimmedPhone) {
                setError('Please provide either an email or a phone number, not both.');
                return;
            }

            // If email provided, validate format and uniqueness.
            if (trimmedEmail) {
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
                    setError('Please enter a valid email address');
                    return;
                }

                const exists = await adminMembersService.emailExists(trimmedEmail);
                if (exists) {
                    setError('This email is already registered');
                    return;
                }
            }

            // Register the member (include waiver flag if set)
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

    const performSearch = async (q: string) => {
        setSearchQuery(q);
        setSelectedExisting(null);
        setHasSearched(!!q && q.trim().length >= 2);

        if (!q || q.trim().length < 2) {
            setSearchResults([]);
            return;
        }

        try {
            const results = await adminMembersService.searchParticipants(q.trim());
            setSearchResults(results);
        } catch (err) {
            console.error('Error searching participants:', err);
            setSearchResults([]);
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>Register New Member</DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                <Stack spacing={2}>
                    {error && <Alert severity="error">{error}</Alert>}

                    <TextField
                        label="Search existing participants"
                        placeholder="Search by name, email, or phone"
                        value={searchQuery}
                        onChange={(e) => performSearch(e.target.value)}
                        fullWidth
                        disabled={isSubmitting}
                    />

                    {!hasSearched && (
                        <Alert severity="info">Search for an existing member before creating a new participant record.</Alert>
                    )}

                    {hasSearched && searchResults.length > 0 && (
                        <Alert severity="warning">Matching participant(s) found.</Alert>
                    )}

                    {hasSearched && searchResults.length === 0 && (
                        <Alert severity="success">No existing participant found.</Alert>
                    )}

                    {searchResults && searchResults.length > 0 && (
                        <List dense>
                            {searchResults.map((r) => (
                                <ListItem key={r.id} disablePadding>
                                    <ListItemButton onClick={() => { setSelectedExisting(r); setSearchResults([]); setSearchQuery(r.name); }}>
                                        <ListItemText primary={r.name} secondary={`${r.email || ''}${r.phone ? ' · ' + r.phone : ''}`} />
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </List>
                    )}

                    {selectedExisting && (
                        <Alert severity="info">
                            Selected existing participant: {selectedExisting.name}
                            <div style={{ marginTop: 8 }}>
                                <Button size="small" onClick={() => { setSelectedExisting(null); setSearchQuery(''); setHasSearched(false); setSearchResults([]); }}>
                                    Clear selection
                                </Button>
                                <Button size="small" onClick={() => { handleClose(); onSuccess(); }}>
                                    Use existing
                                </Button>
                            </div>
                        </Alert>
                    )}

                    <Controller
                        name="email"
                        control={control}
                        rules={{
                            validate: (value) => {
                                const trimmedValue = value?.trim() ?? '';
                                const phoneValue = watch('phone')?.trim() ?? '';

                                if (!trimmedValue && !phoneValue) {
                                    return 'Please provide either an email or a phone number.';
                                }

                                if (trimmedValue && phoneValue) {
                                    return 'Please provide either an email or a phone number, not both.';
                                }

                                if (!trimmedValue) {
                                    return true;
                                }

                                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedValue)
                                    ? true
                                    : 'Please enter a valid email address';
                            },
                        }}
                        render={({ field }) => (
                            <TextField
                                {...field}
                                label="Email"
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
                        rules={{
                            validate: (value) => {
                                const trimmedValue = value?.trim() ?? '';
                                const emailValue = watch('email')?.trim() ?? '';

                                if (!trimmedValue && !emailValue) {
                                    return 'Please provide either an email or a phone number.';
                                }

                                if (trimmedValue && emailValue) {
                                    return 'Please provide either an email or a phone number, not both.';
                                }

                                return true;
                            },
                        }}
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
                        name="waiver_accepted"
                        control={control}
                        render={({ field }) => (
                            <FormControlLabel
                                control={<Checkbox {...field} checked={!!field.value} disabled={isSubmitting} />}
                                label="Waiver signed"
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
                                value={roles as any}
                                onChange={(_event, value) => {
                                    field.onChange(value.map((v: any) => (typeof v === 'string' ? v : v.value)));
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
