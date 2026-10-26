/** @type {import('next').NextConfig} */
const nextConfig = {
  // modbus-serial & serialport are node modules — don't bundle them.
  experimental: {
    serverComponentsExternalPackages: ["modbus-serial", "serialport"],
  },
};

export default nextConfig;
