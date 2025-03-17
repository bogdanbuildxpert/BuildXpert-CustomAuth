# BuildXpert with Custom Authentication

This is a fork of the BuildXpert project that implements a custom authentication system instead of using Supabase Auth directly. The custom authentication system provides:

1. Email/password authentication
2. Google OAuth integration
3. JWT-based session management
4. Role-based access control

## Key Features

- **Custom Authentication Server**: Runs on port 3001 and handles all authentication requests
- **JWT Token-based Authentication**: Secure authentication with JWT tokens stored in HTTP-only cookies
- **Google OAuth Integration**: Sign in with Google accounts
- **Role-based Access Control**: Support for admin and client roles
- **Real-time Notifications**: Integrated with PostgreSQL LISTEN/NOTIFY for real-time updates

## Setup Instructions

### Prerequisites

- Node.js (v16+)
- PostgreSQL database
- Google OAuth credentials (for Google sign-in)

### Environment Variables

Create a `.env` file with the following variables:

```
# Database connection
DATABASE_URL=postgresql://username:password@localhost:5432/buildxpert
POSTGRES_URL=postgresql://username:password@localhost:5432/buildxpert

# JWT Secret for authentication
JWT_SECRET=your-secret-key-change-this-in-production

# Server ports
PORT=3000
API_PORT=3001

# Frontend URL for CORS
FRONTEND_URL=http://localhost:3000

# Google OAuth credentials
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Node environment
NODE_ENV=development
```

### Installation

1. Clone the repository:

   ```
   git clone https://github.com/YOUR_USERNAME/BuildXpert-CustomAuth.git
   cd BuildXpert-CustomAuth
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```

This will start both the Next.js app on port 3000 and the custom authentication server on port 3001.

## Architecture

- **server.js**: Custom Express server that handles authentication and real-time notifications
- **lib/auth-context.tsx**: React context for authentication state management
- **next.config.mjs**: Configuration for API request proxying
- **scripts/check-users.cjs**: Utility script for managing users in the database

## Differences from Original Project

This fork differs from the original BuildXpert project in the following ways:

1. Uses a custom Express server instead of Supabase Auth
2. Implements JWT-based authentication with HTTP-only cookies
3. Handles Google OAuth directly instead of through Supabase
4. Stores user data directly in the PostgreSQL database

## License

[MIT License](LICENSE)

# BuildXpert

BuildXpert is a comprehensive platform for construction painting professionals and clients to connect, post jobs, and manage projects.

## Features

- **User Authentication**: Secure login and registration with email verification
- **Job Posting**: Clients can post detailed job requirements
- **Job Applications**: Professionals can apply to jobs
- **Messaging System**: Real-time chat between clients and professionals
- **Admin Dashboard**: Comprehensive admin controls
- **Contact Form**: With automated email responses
- **Project Showcase**: Gallery of completed projects
- **Responsive Design**: Works on all devices

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Node.js
- **Database**: PostgreSQL
- **Authentication**: NextAuth.js
- **Email**: Nodemailer
- **Deployment**: Vercel (recommended)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/buildxpert.git
   cd buildxpert
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory with the following variables:

   ```
   # PostgreSQL Connection String
   DATABASE_URL="postgresql://username:password@localhost:5432/buildxpert?schema=public"

   # App URL
   NEXT_PUBLIC_APP_URL="http://localhost:3000"

   # JWT Secret for Authentication
   JWT_SECRET="your-secret-key"

   # Email configuration
   EMAIL_USER="your-email@gmail.com"
   EMAIL_PASSWORD="your-app-specific-password"

   # NextAuth
   NEXTAUTH_SECRET="your-nextauth-secret"
   NEXTAUTH_URL="http://localhost:3000"
   ```

4. Set up the database:

   ```bash
   npx prisma migrate dev
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

- `/app`: Next.js app router pages and API routes
- `/components`: Reusable React components
- `/lib`: Utility functions and shared code
- `/prisma`: Database schema and migrations
- `/public`: Static assets

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Next.js](https://nextjs.org/)
- [Prisma](https://www.prisma.io/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)

# Supabase Role-Based Access Control (RBAC) Implementation

This project demonstrates how to implement Role-Based Access Control (RBAC) with custom JWT claims in Supabase using PostgreSQL functions and triggers.

## Features

- Custom JWT claims with user roles and permissions
- Row-Level Security (RLS) policies based on user permissions
- React hooks for permission and role checking
- Admin panel for managing user roles
- Automatic role assignment for new users

## Database Structure

The RBAC system consists of the following database objects:

1. **Custom Types**:

   - `app_role`: Enum of available roles ('admin', 'editor', 'viewer')
   - `app_permission`: Enum of available permissions ('resources.create', 'resources.update', 'resources.delete')

2. **Tables**:

   - `user_roles`: Maps users to roles
   - `role_permissions`: Maps roles to permissions
   - `resources`: Sample table with RLS policies

3. **Functions**:

   - `get_user_roles`: Get all roles for a user
   - `has_role`: Check if a user has a specific role
   - `has_permission`: Check if a user has a specific permission
   - `get_user_permissions`: Get all permissions for a user
   - `add_user_role`: Add a role to a user (admin only)
   - `remove_user_role`: Remove a role from a user (admin only)

4. **Triggers**:
   - `on_auth_user_created`: Automatically assign the 'viewer' role to new users

## Setup

1. Run the migration files in the `supabase/migrations` directory:

   ```bash
   supabase migration up
   ```

2. Configure your Supabase client in your application:

   ```typescript
   import { createClient } from "@supabase/supabase-js";

   const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
   const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
   const supabase = createClient(supabaseUrl, supabaseAnonKey);
   ```

## Usage

### Checking Permissions in React Components

```tsx
import { usePermission, useRole } from "../lib/rbac";

function MyComponent() {
  const { hasPermission: canCreate } = usePermission("resources.create");
  const { hasRole: isAdmin } = useRole("admin");

  return (
    <div>
      {canCreate && <button>Create Resource</button>}
      {isAdmin && <AdminPanel />}
    </div>
  );
}
```

### Managing User Roles (Admin Only)

```typescript
import { rbac } from "../lib/rbac";

// Add a role to a user
await rbac.addUserRole("user-uuid", "editor");

// Remove a role from a user
await rbac.removeUserRole("user-uuid", "editor");
```

### Checking Permissions Programmatically

```typescript
import { rbac } from "../lib/rbac";

// Check if the current user has a specific permission
const canDeleteResources = await rbac.hasPermission("resources.delete");

// Check if the current user has a specific role
const isAdmin = await rbac.hasRole("admin");
```

## Security Considerations

- All role management functions are protected with security definer and role checks
- RLS policies ensure users can only perform actions they have permission for
- JWT claims are automatically updated when user roles change

## License

MIT

## Role-Based Access Control (RBAC)

BuildXpert uses a Role-Based Access Control (RBAC) system to manage user permissions. The system is implemented using Supabase's PostgreSQL functions and custom JWT claims.

### Roles and Permissions

The system includes the following roles:

- **admin**: Full access to all features, including the admin dashboard
- **editor**: Can create and update resources
- **viewer**: Basic access with limited permissions

Each role has specific permissions:

| Role   | Create Resources | Update Resources | Delete Resources |
| ------ | ---------------- | ---------------- | ---------------- |
| admin  | ✅               | ✅               | ✅               |
| editor | ✅               | ✅               | ❌               |
| viewer | ✅               | ❌               | ❌               |

### Admin Dashboard Access

The admin dashboard is protected by the RBAC system. Only users with the `admin` role can access it. If a user without the admin role tries to access the admin dashboard, they will be redirected to the login page.

### Assigning the Admin Role

To assign the admin role to a user, you can use the provided script:

```bash
# Set environment variables
export SUPABASE_URL=your-supabase-url
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Run the script with the user ID
node scripts/assign-admin-role.js user-uuid
```

Alternatively, you can assign roles through the admin dashboard if you already have an admin user.

### Using RBAC in Components

You can use the provided React hooks to check for roles and permissions in your components:

```tsx
import { useRole, usePermission } from "@/src/lib/rbac";

function MyComponent() {
  const { hasRole: isAdmin } = useRole("admin");
  const { hasPermission: canDeleteResources } =
    usePermission("resources.delete");

  return (
    <div>
      {isAdmin && <AdminPanel />}
      {canDeleteResources && <DeleteButton />}
    </div>
  );
}
```
