export interface paths {
    "/api/errorTest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": Record<string, never>;
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        tenantCode: string;
                        loginId: string;
                        password: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            tenant: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                            };
                            user: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                                /** @enum {string} */
                                role: "ADMIN" | "MEMBER";
                            };
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/passwordResetRequest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        mode: "request" | "reset";
                        tenantCode: string;
                        loginId: string;
                        authCode?: string;
                        newPassword?: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            maskedEmail?: string;
                            authErrorMessage?: string;
                            backToRequestMode?: boolean;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ping": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            status: string;
                            addr?: string;
                            ua?: string;
                            deviceId?: string;
                            sessionId?: string;
                            /** Format: uuid */
                            tenantId?: string;
                            version?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/debug/remoteIp": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    dummyDataLength?: number;
                };
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            remoteIp: string;
                            xForwardedFor: string;
                            dummyData: string;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/debug/wait": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    sleep?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            waited: number;
                            /** Format: date-time */
                            now: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/private/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": Record<string, never>;
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/private/master": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            tenantConfig: Record<string, never>;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/private/passwordChange": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        oldPassword: string;
                        newPassword: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": Record<string, never>;
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/private/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    page?: number;
                    perPage?: number;
                };
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            reports: {
                                /** Format: uuid */
                                id: string;
                                title: string;
                                comment: string;
                                /** Format: uuid */
                                userId: string;
                                userName: string;
                                /** Format: date-time */
                                createdAt: string;
                                images: {
                                    /** Format: uuid */
                                    id: string;
                                    width: number;
                                    height: number;
                                    thumbnailUrl: string;
                                }[];
                            }[];
                            total: number;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        title: string;
                        comment: string;
                        imageIds: string[];
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            report: {
                                /** Format: uuid */
                                id: string;
                                title: string;
                                comment: string;
                                /** Format: uuid */
                                userId: string;
                                userName: string;
                                /** Format: date-time */
                                createdAt: string;
                                images: {
                                    /** Format: uuid */
                                    id: string;
                                    width: number;
                                    height: number;
                                    thumbnailUrl: string;
                                }[];
                            };
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        delete: {
            parameters: {
                query: {
                    id: string;
                };
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            ok: true;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/private/uploadedImages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            uploadedImage: {
                                /** Format: uuid */
                                id: string;
                                width: number;
                                height: number;
                                byteSize: number;
                                thumbnailUrl: string;
                            };
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        delete: {
            parameters: {
                query: {
                    id: string;
                };
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            ok: true;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/private/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    page?: number;
                    perPage?: number;
                    search?: string;
                };
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            users: {
                                /** Format: uuid */
                                id: string;
                                userName: string;
                                loginId: string;
                                email: string;
                                /** @enum {string} */
                                role: "ADMIN" | "MEMBER";
                                isDisabled: boolean;
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                lastLoginAt: string | null;
                            }[];
                            total: number;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        userName: string;
                        loginId: string;
                        email: string | "";
                        /** @enum {string} */
                        role: "ADMIN" | "MEMBER";
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            user: {
                                /** Format: uuid */
                                id: string;
                                userName: string;
                                loginId: string;
                                email: string;
                                /** @enum {string} */
                                role: "ADMIN" | "MEMBER";
                                isDisabled: boolean;
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                lastLoginAt: string | null;
                            };
                            initialPassword: string;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        userName?: string;
                        email?: string | "";
                        /** @enum {string} */
                        role?: "ADMIN" | "MEMBER";
                        isDisabled?: boolean;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            user: {
                                /** Format: uuid */
                                id: string;
                                userName: string;
                                loginId: string;
                                email: string;
                                /** @enum {string} */
                                role: "ADMIN" | "MEMBER";
                                isDisabled: boolean;
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                lastLoginAt: string | null;
                            };
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/private/debug/changeUser": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        userId: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            user: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                                /** @enum {string} */
                                role: "ADMIN" | "MEMBER";
                            };
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/private/debug/debugParams": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            virtualDate: string;
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        virtualDate: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": Record<string, never>;
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/private/debug/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: {
                    "x-tenant-id"?: string;
                    "x-for-preflight"?: string;
                    "x-client-version"?: string;
                    "x-forwarded-for"?: string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            users: {
                                /** Format: uuid */
                                id: string;
                                userName: string;
                                loginId: string;
                                /** @enum {string} */
                                role: "ADMIN" | "MEMBER";
                                isDisabled: boolean;
                            }[];
                        };
                    };
                };
                /** @description Default Response */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
                /** @description Default Response */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message?: string;
                            actions?: ("reloadReservation" | "forceLogout" | "historyBack" | "reloadApp")[];
                            errors?: unknown;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
