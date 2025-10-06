import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';

// SAFE Migration function to move payments from old system to new system
export const migratePayments = async (userId) => {
    try {
        console.log('Starting SAFE payment migration...');
        
        // Get all documents with payments
        const documentsQuery = query(
            collection(db, `documents/${userId}/userDocuments`),
            where('payments', '!=', null)
        );
        
        const documentsSnapshot = await getDocs(documentsQuery);
        let migratedCount = 0;
        const migrationResults = [];
        
        // STEP 1: Migrate all payments first (without clearing old data)
        for (const docSnapshot of documentsSnapshot.docs) {
            const documentData = docSnapshot.data();
            const documentId = docSnapshot.id;
            
            if (documentData.payments && Array.isArray(documentData.payments) && documentData.payments.length > 0) {
                const documentPayments = [];
                
                // Migrate each payment for this document
                for (const payment of documentData.payments) {
                    const paymentData = {
                        clientId: documentData.client?.id || 'unknown',
                        documentId: documentId,
                        amount: payment.amount || 0,
                        paymentDate: payment.date || payment.timestamp || new Date(),
                        paymentMethod: 'migrated',
                        reference: `Migrated from ${documentData.type || 'document'}`,
                        notes: payment.note || 'Migrated payment',
                        createdAt: payment.timestamp || new Date(),
                        updatedAt: new Date(),
                        migrated: true
                    };
                    
                    const newPaymentRef = await addDoc(collection(db, 'payments'), paymentData);
                    documentPayments.push(newPaymentRef.id);
                    migratedCount++;
                }
                
                // Store migration result for verification
                migrationResults.push({
                    documentId,
                    originalPaymentsCount: documentData.payments.length,
                    migratedPaymentIds: documentPayments
                });
            }
        }
        
        // STEP 2: Verify migration was successful
        console.log('Verifying migration...');
        const verification = await verifyMigration(userId);
        
        if (!verification.success) {
            throw new Error('Migration verification failed');
        }
        
        // STEP 3: Only clear old payments if migration was successful
        if (migrationResults.length > 0) {
            console.log('Migration successful, clearing old payment data...');
            
            for (const result of migrationResults) {
                await updateDoc(doc(db, `documents/${userId}/userDocuments`, result.documentId), {
                    payments: [], // Clear old payments
                    migrationCompleted: true,
                    migrationDate: new Date(),
                    migratedPaymentCount: result.originalPaymentsCount
                });
            }
        }
        
        console.log(`SAFE Migration completed. Migrated ${migratedCount} payments from ${migrationResults.length} documents.`);
        return { 
            success: true, 
            migratedCount, 
            documentsProcessed: migrationResults.length,
            verification: verification
        };
        
    } catch (error) {
        console.error('Migration failed:', error);
        return { success: false, error: error.message };
    }
};

// Function to verify migration
export const verifyMigration = async (userId) => {
    try {
        // Check if any documents still have old payments
        const documentsQuery = query(
            collection(db, `documents/${userId}/userDocuments`),
            where('payments', '!=', null)
        );
        
        const documentsSnapshot = await getDocs(documentsQuery);
        const documentsWithOldPayments = [];
        
        documentsSnapshot.forEach(doc => {
            if (doc.data().payments && doc.data().payments.length > 0) {
                documentsWithOldPayments.push(doc.id);
            }
        });
        
        // Check payments collection
        const paymentsQuery = query(collection(db, 'payments'));
        const paymentsSnapshot = await getDocs(paymentsQuery);
        const paymentsCount = paymentsSnapshot.size;
        
        return {
            success: true,
            documentsWithOldPayments,
            paymentsCount,
            migrationNeeded: documentsWithOldPayments.length > 0
        };
        
    } catch (error) {
        console.error('Verification failed:', error);
        return { success: false, error: error.message };
    }
};

// Emergency rollback function (if needed)
export const rollbackMigration = async (userId) => {
    try {
        console.log('Starting migration rollback...');
        
        // Get all migrated payments
        const paymentsQuery = query(
            collection(db, 'payments'),
            where('migrated', '==', true)
        );
        
        const paymentsSnapshot = await getDocs(paymentsQuery);
        let rollbackCount = 0;
        
        // Group payments by document
        const paymentsByDocument = {};
        paymentsSnapshot.forEach(doc => {
            const payment = doc.data();
            if (!paymentsByDocument[payment.documentId]) {
                paymentsByDocument[payment.documentId] = [];
            }
            paymentsByDocument[payment.documentId].push({
                id: doc.id,
                amount: payment.amount,
                date: payment.paymentDate,
                note: payment.notes,
                timestamp: payment.createdAt
            });
        });
        
        // Restore payments to documents
        for (const [documentId, payments] of Object.entries(paymentsByDocument)) {
            const documentRef = doc(db, `documents/${userId}/userDocuments`, documentId);
            
            // Convert back to old format
            const oldFormatPayments = payments.map(p => ({
                amount: p.amount,
                date: p.date,
                note: p.note,
                timestamp: p.timestamp
            }));
            
            await updateDoc(documentRef, {
                payments: oldFormatPayments,
                migrationCompleted: false,
                rollbackDate: new Date()
            });
            
            rollbackCount += payments.length;
        }
        
        console.log(`Rollback completed. Restored ${rollbackCount} payments.`);
        return { success: true, rollbackCount };
        
    } catch (error) {
        console.error('Rollback failed:', error);
        return { success: false, error: error.message };
    }
};
