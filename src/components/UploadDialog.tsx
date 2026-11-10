/**
 * ProfileDialog.ts
 *
 * @copyright 2026 Digital Aid Seattle
 */

import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tooltip, Typography } from '@mui/material';
import { useContext, useState } from 'react';

import { LoadingContext, RefreshContext, useNotifications } from '@digitalaidseattle/core';
import { Profile } from '../services/members/ProfilesDao';
import { ProfilesService } from '../services/members/ProfilesService';
import FileUploader from './FileUploader';

type UploadDialogProps = {
    title: string;
    open: boolean;
    onChange: (updated: Profile | null) => void
};

export default function UploadDialog({
    title,
    open,
    onChange
}: UploadDialogProps) {

    const profilesService = ProfilesService.getInstance();
    const notifications = useNotifications();

    const { setLoading } = useContext(LoadingContext);
    const { setRefresh } = useContext(RefreshContext);

    const [files, setFiles] = useState<File[]>([]);
    const [fileErrors, setFileErrors] = useState<Record<string, string[]>>({});

    function handleCancel() {
        onChange(null);
    }

    async function handleSubmit(): Promise<void> {
        setLoading(true);
        try {
            const importedProfiles = await profilesService.importProfiles(files);
            notifications.success(`${importedProfiles.length} profiles have been imported.`);
            onChange(null);
            setRefresh(Date.now());
        } catch (err) {
            console.error(`Problems importing files.`, err);
            notifications.error(`Problems importing files.`)
        } finally {
            setLoading(false);
        }
    }

    function removeFile(file: File) {
        setFiles(prev => prev.filter(f => f !== file));
    }

    async function handleUpload(files: File[]): Promise<void> {
        if (files.length > 0) {
            setLoading(true);
            try {
                const errors = await profilesService.validateFiles(files);
                setFileErrors(errors);
                setFiles(files);
            } catch (err) {
                console.error(`Problems importing ${files[0].name}.`, err);
                notifications.error(`Problems importing ${files[0].name}.`)
            } finally {
                setLoading(false);
            }
        }
    }

    function hasFileErrors(): boolean {
        return Object.values(fileErrors).some(errors => errors.length > 0);
    }

    return (
        <Dialog
            fullWidth={true}
            open={open}
            onClose={() => handleCancel()}>
            <DialogTitle><Typography fontWeight={600} fontSize={16}>{title}</Typography></DialogTitle>
            <DialogContent>
                <FileUploader onChange={handleUpload} />
                {files.length > 0 &&
                    <Stack direction='row' flexWrap='wrap' gap={1} mt={1}>
                        {files.map(file => {
                            const errors = fileErrors[file.name] ?? [];
                            return (
                                <Tooltip key={file.name} title={errors.join(' ')}>
                                    <Chip
                                        label={file.name}
                                        size='small'
                                        color={errors.length > 0 ? 'error' : 'default'}
                                        onDelete={() => removeFile(file)} />
                                </Tooltip>
                            )
                        })}
                    </Stack>
                }
            </DialogContent>
            <DialogActions>
                <Button
                    variant='outlined'
                    sx={{ color: 'text.secondary' }}
                    onClick={handleCancel}>Cancel</Button>
                <Button
                    variant='contained'
                    sx={{ color: 'text.success' }}
                    disabled={files.length === 0 || hasFileErrors()}
                    onClick={handleSubmit}>OK</Button>
            </DialogActions>
        </Dialog>
    );

}