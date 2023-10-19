const sharedShader = `
    mat3 quatToMat3(vec3 R)
    {
        float x = R.x;
        float y = R.y;
        float z = R.z;
        float w = sqrt(1.0 - dot(R, R));

        return mat3(
            1.0 - 2.0 * (z * z + w * w),
                2.0 * (y * z + x * w),
                2.0 * (y * w - x * z),

                2.0 * (y * z - x * w),
            1.0 - 2.0 * (y * y + w * w),
                2.0 * (z * w + x * y),

                2.0 * (y * w + x * z),
                2.0 * (z * w - x * y),
            1.0 - 2.0 * (y * y + z * z)
        );
    }

    #ifdef WEBGPU
        attribute uint vertex_id;
    #else
        attribute float vertex_id;
    #endif

    uniform vec4 tex_params;
    uniform sampler2D splatColor;

    #ifdef WEBGPU
        ivec2 getTextureCoords() {

            // turn vertex_id into int grid coordinates
            ivec2 textureSize = ivec2(tex_params.xy);
            vec2 invTextureSize = tex_params.zw;

            int gridV = int(float(vertex_id) * invTextureSize.x);
            int gridU = int(vertex_id - gridV * textureSize.x);
            return ivec2(gridU, gridV);
        }

    #else
        vec2 getTextureCoords() {
            vec2 textureSize = tex_params.xy;
            vec2 invTextureSize = tex_params.zw;

            // turn vertex_id into int grid coordinates
            float gridV = floor(vertex_id * invTextureSize.x);
            float gridU = vertex_id - (gridV * textureSize.x);

            // convert grid coordinates to uv coordinates with half pixel offset
            return vec2(gridU, gridV) * invTextureSize + (0.5 * invTextureSize);
        }
    #endif

    vec4 getColor() {
        #ifdef WEBGPU
            ivec2 textureUV = getTextureCoords();
            return texelFetch(splatColor, ivec2(textureUV), 0);
        #else
            vec2 textureUV = getTextureCoords();
            return texture2D(splatColor, textureUV);
        #endif
    }
`;

const splatVS = `
    attribute vec2 vertex_position;
    attribute vec3 splat_center;
    attribute vec3 splat_rotation;
    attribute vec3 splat_scale;

    uniform mat4 matrix_model;
    uniform mat4 matrix_view;
    uniform mat4 matrix_projection;

    uniform vec2 viewport;

    varying vec2 texCoord;
    varying vec4 color;

    ${sharedShader}

    void computeCov3d(in vec3 rot, in vec3 scale, out vec3 covA, out vec3 covB)
    {
        mat3 R = quatToMat3(rot);

        // M = S * R
        float M[9] = float[9](
            scale.x * R[0][0],
            scale.x * R[0][1],
            scale.x * R[0][2],
            scale.y * R[1][0],
            scale.y * R[1][1],
            scale.y * R[1][2],
            scale.z * R[2][0],
            scale.z * R[2][1],
            scale.z * R[2][2]
        );

        covA = vec3(
            M[0] * M[0] + M[3] * M[3] + M[6] * M[6],
            M[0] * M[1] + M[3] * M[4] + M[6] * M[7],
            M[0] * M[2] + M[3] * M[5] + M[6] * M[8]
        );

        covB = vec3(
            M[1] * M[1] + M[4] * M[4] + M[7] * M[7],
            M[1] * M[2] + M[4] * M[5] + M[7] * M[8],
            M[2] * M[2] + M[5] * M[5] + M[8] * M[8]
        );
    }

    void main(void)
    {
        vec4 splat_cam = matrix_view * matrix_model * vec4(splat_center, 1.0);
        vec4 splat_proj = matrix_projection * splat_cam;

        // cull behind camera
        if (splat_proj.z < -splat_proj.w) {
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            return;
        }

        vec3 splat_cova;
        vec3 splat_covb;
        computeCov3d(splat_rotation, splat_scale, splat_cova, splat_covb);

        mat3 Vrk = mat3(
            splat_cova.x, splat_cova.y, splat_cova.z, 
            splat_cova.y, splat_covb.x, splat_covb.y,
            splat_cova.z, splat_covb.y, splat_covb.z
        );

        float focal = viewport.x * matrix_projection[0][0];

        mat3 J = mat3(
            focal / splat_cam.z, 0., -(focal * splat_cam.x) / (splat_cam.z * splat_cam.z), 
            0., focal / splat_cam.z, -(focal * splat_cam.y) / (splat_cam.z * splat_cam.z), 
            0., 0., 0.
        );

        mat3 W = transpose(mat3(matrix_view));
        mat3 T = W * J;
        mat3 cov = transpose(T) * Vrk * T;

        float diagonal1 = cov[0][0] + 0.3;
        float offDiagonal = cov[0][1];
        float diagonal2 = cov[1][1] + 0.3;

            float mid = 0.5 * (diagonal1 + diagonal2);
            float radius = length(vec2((diagonal1 - diagonal2) / 2.0, offDiagonal));
            float lambda1 = mid + radius;
            float lambda2 = max(mid - radius, 0.1);
            vec2 diagonalVector = normalize(vec2(offDiagonal, lambda1 - diagonal1));
            vec2 v1 = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector;
            vec2 v2 = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x);

        gl_Position = splat_proj +
            vec4((vertex_position.x * v1 + vertex_position.y * v2) / viewport * 2.0,
                0.0, 0.0) * splat_proj.w;

        texCoord = vertex_position * 2.0;

        color = getColor();
    }
`;

const splatFS = /* glsl_ */ `
    varying vec2 texCoord;
    varying vec4 color;

    void main(void)
    {
        float A = -dot(texCoord, texCoord);
        if (A < -4.0) discard;
        float B = exp(A) * color.a;
        gl_FragColor = vec4(color.rgb, B);
    }
`;

const splatDebugVS = /* glsl_ */ `
    attribute vec3 vertex_position;
    attribute vec3 splat_center;
    attribute vec3 splat_rotation;
    attribute vec3 splat_scale;

    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;

    varying vec4 color;

    ${sharedShader}

    void main(void)
    {
        vec3 local = quatToMat3(splat_rotation) * (vertex_position * splat_scale * 2.0) + splat_center;
        gl_Position = matrix_viewProjection * matrix_model * vec4(local, 1.0);

        color = getColor();
    }
`;

const splatDebugFS = /* glsl_ */ `
    varying vec4 color;

    void main(void)
    {
        if (color.a < 0.2) discard;
        gl_FragColor = color;
    }
`;

export { splatVS, splatFS, splatDebugVS, splatDebugFS };
