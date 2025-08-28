/**
 * @file 连接数据库配置表单
 */
import React, { useState } from 'react';
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Input,
  InputGroup,
  InputRightElement,
  IconButton,
  VStack,
  HStack,
  Text,
  Alert,
  AlertIcon
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { DatasetImportContext } from '../Context';
import { useContextSelector } from 'use-context-selector';
import FormBottomButtons from './FormBottomButtons';
import { useConnectionTest } from './hooks/useConnectTest'

type DatabaseFormData = {
  dbType: string;
  host: string;
  port: string;
  dbName: string;
  username: string;
  password: string;
  connectionPoolSize: number;
};

const PORT_RANGE = [1, 65535];

const ConnectDatabaseConfig = () => {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);

  const goToNext = useContextSelector(DatasetImportContext, (v) => v.goToNext);
  const isEditMode = useContextSelector(DatasetImportContext, (v) => v.isEditMode);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<DatabaseFormData>({
    defaultValues: {
      dbType: 'MySQL',
      host: '',
      port: '',
      dbName: '',
      username: '',
      password: '',
      connectionPoolSize: 20
    }
  });

  const onSubmit = (data: DatabaseFormData) => {
    console.log('Database config:', data);
    goToNext();
    // Handle form submission
  };

  const {
    isConnecting,
    connectionError,
    connectionSuccess,
    testConnection,
    resetConnectionState
  } = useConnectionTest();

  const handleTestConnection = async () => {
    // const formData = getValues();
    await testConnection({});
  };

  const handleConnectAndNext = async () => {
    // const formData = getValues();
    const result = await testConnection({});

    if (result.success) {
      goToNext();
    }
  };


  return (
    <Box w="full" maxW="800px" mx="auto" p={2}>
      {/* Edit Mode Warning Banner */}
      {isEditMode && (
        <Alert status="warning" borderRadius="md" mb={4}>
          <AlertIcon />
          <Text fontSize="sm">
            {t('dataset:edit_database_warning')}
          </Text>
        </Alert>
      )}

      {/* Form */}
      <VStack spacing={6} align="stretch">
        {/* Database Type */}
        {
          !isEditMode && (
            <FormControl isRequired>
              <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900" mb={3}>
                {t('dataset:database_type')}
              </FormLabel>
              <Box
                border="1px solid"
                borderColor="blue.200"
                borderRadius="md"
                p={3}
                bg="blue.50"
                cursor="pointer"
              >
                <HStack spacing={3}>
                  <MyIcon name="database" w="20px" h="20px" color="blue.500" />
                  <Box>
                    <Text fontSize="sm" fontWeight="medium" color="myGray.900">
                      MySQL
                    </Text>
                    <Text fontSize="xs" color="myGray.600">
                      {t('dataset:mysql_description')}
                    </Text>
                  </Box>
                </HStack>
              </Box>
            </FormControl>
          )
        }

        {/* Database Host */}
        <FormControl isRequired isInvalid={!!errors.host}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dataset:database_host')}
          </FormLabel>
          <Input
            placeholder={t('dataset:host_placeholder')}
            bg="myGray.50"
            {...register('host', {
              required: t('dataset:host_required')
            })}
          />
          <Text fontSize="xs" color="myGray.500" mt={1}>
            {t('dataset:host_tips')}
          </Text>
          {errors.host && <FormErrorMessage>{errors.host.message}</FormErrorMessage>}
        </FormControl>

        {/* Port */}
        <FormControl isRequired isInvalid={!!errors.port}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dataset:port')}
          </FormLabel>
          <Input
            placeholder="3306"
            bg="myGray.50"
            {...register('port', {
              required: t('dataset:port_required'),
              validate: val => {
                const number = Number(val);
                if (typeof number !== 'number' || isNaN(number)) {
                  return t('dataset:port_invalid');
                }
                return number >= PORT_RANGE[0] && number <= PORT_RANGE[1]
                  ? true
                  : t('dataset:port_range_error');
              }
            })}
          />
          {errors.port && <FormErrorMessage>{errors.port.message}</FormErrorMessage>}
        </FormControl>

        {/* Database Name */}
        <FormControl isRequired isInvalid={!!errors.dbName}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dataset:database_name')}
          </FormLabel>
          <Input
            placeholder={t('dataset:database_name_placeholder')}
            bg="myGray.50"
            {...register('dbName', {
              required: t('dataset:database_name_required')
            })}
          />
          {errors.dbName && <FormErrorMessage>{errors.dbName.message}</FormErrorMessage>}
        </FormControl>

        {/* Username */}
        <FormControl isRequired isInvalid={!!errors.username}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dataset:database_username')}
          </FormLabel>
          <Input
            placeholder={t('dataset:username_placeholder')}
            bg="myGray.50"
            {...register('username', {
              required: t('dataset:username_required')
            })}
          />
          {errors.username && <FormErrorMessage>{errors.username.message}</FormErrorMessage>}
        </FormControl>

        {/* Password */}
        <FormControl isRequired isInvalid={!!errors.password}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dataset:database_password')}
          </FormLabel>
          <InputGroup>
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder={t('dataset:password_placeholder')}
              bg="myGray.50"
              {...register('password', {
                required: t('dataset:password_required')
              })}
            />
            <InputRightElement>
              <IconButton
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                icon={<MyIcon name={showPassword ? 'eyeClose' : 'eye'} w="16px" />}
                size="sm"
                variant="ghost"
                color="myGray.500"
                onClick={() => setShowPassword(!showPassword)}
              />
            </InputRightElement>
          </InputGroup>
          {errors.password && <FormErrorMessage>{errors.password.message}</FormErrorMessage>}
        </FormControl>

        {/* Connection Pool Size */}
        <FormControl isRequired isInvalid={!!errors.connectionPoolSize}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dataset:connection_pool_size')}
          </FormLabel>
          <Input
            type="number"
            placeholder="20"
            bg="myGray.50"
            {...register('connectionPoolSize', {
              required: t('dataset:connection_pool_required'),
              min: {
                value: 1,
                message: t('dataset:connection_pool_min_error')
              },
              max: {
                value: 100,
                message: t('dataset:connection_pool_max_error')
              }
            })}
          />
          {errors.connectionPoolSize && (
            <FormErrorMessage>{errors.connectionPoolSize.message}</FormErrorMessage>
          )}
        </FormControl>

        {/* Submit Button */}
        {/* <Flex justify="flex-end" mt={6}>
          {isEditMode ? (
            <HStack spacing={3}>
              <Button
                variant="outline"
                colorScheme="gray"
                onClick={() => {
                  // Handle test connection
                  console.log('Test connection');
                }}
                px={6}
              >
                {t('测试连通性')}
              </Button>
              <Button
                colorScheme="blue"
                onClick={handleSubmit(onSubmit)}
                px={6}
              >
                {t('确认')}
              </Button>
            </HStack>
          ) : (
            <Button
              colorScheme="blue"
              onClick={handleSubmit(onSubmit)}
              px={6}
            >
              {t('dataset:connect_next_step')}
            </Button>
          )}
        </Flex> */}
        <FormBottomButtons
          isEditMode={isEditMode}
          isConnecting={isConnecting}
          connectionError={connectionError}
          connectionSuccess={connectionSuccess}
          onTestConnection={handleTestConnection}
          onConnectAndNext={handleConnectAndNext}
        />
      </VStack>
    </Box>
  );
};

export default ConnectDatabaseConfig;