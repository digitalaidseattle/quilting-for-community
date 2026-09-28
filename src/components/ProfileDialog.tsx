/**
 * ProfileDialog.ts
 *
 * @copyright 2026 Digital Aid Seattle
 */

import { useEffect } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { SubmitHandler, useForm } from 'react-hook-form';

import { Profile } from '../services/members/ProfilesDao';
import { ProfilesService } from '../services/members/ProfilesService';

type ProfileDialogProfile = {
    title: string;
    profile: Profile;
    open: boolean;
    onChange: (updated: Profile | null) => void
};

export default function ProfileDialog({
    title,
    profile,
    open,
    onChange
}: ProfileDialogProfile) {

    const profilesService = ProfilesService.getInstance();

    const {
        register,
        handleSubmit,
        getValues,
        clearErrors,
        reset,
        formState: { errors, validatingFields, isDirty },
    } = useForm<Profile>({
        mode: 'onTouched',
        defaultValues: profilesService.empty()
    });

    useEffect(() => {
        if (open && profile) {
            reset(profile);
        }
    }, [open, profile, reset]);

    function handleCancel() {
        onChange(null);
    }

    const onSubmit: SubmitHandler<Profile> = (data: Profile) => {
        onChange(data);
    };

    async function isNameAvailable(value: string): Promise<boolean> {
        await new Promise(resolve => setTimeout(resolve, 300));
        const trimmed = value.trim();
        const response = await profilesService.searchBy('name', trimmed)
        return response.length === 0;
    }

    async function isEmailAvailable(value: string): Promise<boolean> {
        await new Promise(resolve => setTimeout(resolve, 300));
        const trimmed = value.trim();
        if (trimmed.length > 0) {
            const response = await profilesService.findBy('email', trimmed.toLowerCase())
            return response.length === 0;
        }
        return true;
    }

    return (
        <Dialog
            fullWidth={true}
            open={open}
            onClose={() => handleCancel()}>
            <DialogTitle><Typography fontWeight={600} fontSize={16}>{title}</Typography></DialogTitle>
            <DialogContent>
                <Stack spacing={2}>
                    <TextField
                        label="Name"
                        {...register('name', {
                            required: true,
                        })}
                        error={!!errors.name}
                        helperText={errors.name?.message}
                        sx={{ minHeight: '75px' }}
                    />
                    <TextField
                        label="Email"
                        type="email"
                        {...register('email', {
                            pattern: {
                                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                                message: 'Enter a valid email address',
                            },
                            validate: async (value) => {
                                const available = await isEmailAvailable(value);
                                return available || 'This email is already in use';
                            },
                        })}
                        error={!!errors.email}
                        helperText={errors.email?.message || (validatingFields.email ? 'Checking availability...' : undefined)}
                        sx={{ minHeight: '75px' }}
                    />
                    <TextField
                        label="Phone"
                        {...register('phone')}
                        error={!!errors.phone}
                        helperText={errors.phone?.message}
                        sx={{ minHeight: '75px' }}
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button
                    variant='outlined'
                    sx={{ color: 'text.secondary' }}
                    onClick={handleCancel}>Cancel</Button>
                <Button
                    variant='contained'
                    sx={{ color: 'text.success' }}
                    disabled={!isDirty || Object.keys(errors).length > 0}
                    onClick={handleSubmit(onSubmit)}>OK</Button>
            </DialogActions>
        </Dialog>
    );

}