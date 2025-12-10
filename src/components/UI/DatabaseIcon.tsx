import React from 'react';

interface DatabaseIconProps {
    dbType: 'PostgreSQL' | 'MySQL' | 'SQLite' | 'SQLServer';
    size?: number;
}

export const DatabaseIcon: React.FC<DatabaseIconProps> = ({ dbType, size = 24 }) => {
    const logoMap: Record<string, string> = {
        'PostgreSQL': '/logos/postgre.png',
        'MySQL': '/logos/mysql.png',
        'SQLite': '/logos/sqlite.png',
        'SQLServer': '/logos/sqlsrv.png',
    };

    const logo = logoMap[dbType];

    if (!logo) {
        return null;
    }

    return (
        <img
            src={logo}
            alt={`${dbType} logo`}
            width={size}
            height={size}
            style={{
                objectFit: 'contain',
                borderRadius: '2px',
            }}
        />
    );
};

export default DatabaseIcon;
