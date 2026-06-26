/**
 *  LoginPage.tsx
 *
 *  @copyright 2026 Digital Aid Seattle
 *
 */

import React, { useEffect, useState } from 'react';

// material-ui
import { Box, Button, Card, CardContent, CardMedia, Container, Stack, TextField, Typography, Divider } from '@mui/material';

// das
import { useAuthService } from '@digitalaidseattle/core';
import { useLayoutConfiguration } from '@digitalaidseattle/mui';
import { Social } from '@digitalaidseattle/mui';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Q4CAuthService } from '../services/Q4CAuthService';

const LoginPage: React.FC = () => {
  const { configuration } = useLayoutConfiguration();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const authService = useAuthService() as Q4CAuthService;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);


  useEffect(() => {
    if (!searchParams) {
      return;
    }

    switch (searchParams.get('code')) {
      case 'AccessDenied':
        setErrorMessage(
          'You are not authorized to access this application. Please contact the system administrator.'
        );
        break;
      case 'Unauthenticated':
        setErrorMessage('You have been logged out of this application. Please try again.');
        break;
      case 'Logout':
        setErrorMessage('You have successfully been logged out of the application.');
        break;
      default:
        setErrorMessage('');
    }
  }, [searchParams]);

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await authService.signInWithEmail(trimmedEmail, password);

      if (error) {
        setErrorMessage('Invalid email or password.');
        return;
      }

      navigate('/');
    } catch {
      setErrorMessage('Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container id="cont" sx={{ width: "33%", get: 2 }}>
      <Card id="card" sx={{ gap: 2 }}>
        <CardContent sx={{ textAlign: 'center', alignItems: 'center' }}>
          {(errorMessage !== '') &&
            <Box sx={{ margin: 2 }}>
              <Typography fontWeight={600}>{errorMessage}</Typography>
            </Box>
          }
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
            }}
          >
            <CardMedia
              component="img"
              sx={{
                objectFit: "cover",
                width: "150px"
              }}
              image={configuration.logoUrl}
              alt={configuration.appName + ' Logo'}
            />
          </Box>
          <Box sx={{ margin: 2 }}>
            <Typography variant="h4">{configuration.appName}</Typography>
          </Box>
          <Box sx={{ margin: 2 }}>
            <Typography variant="h5">Please login</Typography>
          </Box>
          <Box component="form" onSubmit={handleSubmit} sx={{ margin: 2 }}>
            <Stack spacing={2}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                fullWidth
                disabled={loading}
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                fullWidth
                disabled={loading}
              />
              <Button type="submit" variant="contained" fullWidth disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
            </Stack>
          </Box>

          <Divider sx={{ margin: 2 }}>or</Divider>

          <Social />
        </CardContent>
      </Card>
    </Container>
  )
};

export default LoginPage;
