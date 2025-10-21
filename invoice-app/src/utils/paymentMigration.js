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
        let skippedProformas = 0;
        const migrationResults = [];

        // STEP 1: Migrate all payments first (without clearing old data)
        // IMPORTANT: Skip proformas as payments should not be on proformas
        for (const docSnapshot of documentsSnapshot.docs) {
            const documentData = docSnapshot.data();
            const documentId = docSnapshot.id;

            // Skip proformas - payments on proformas should have been moved when converted to invoice
            if (documentData.type === 'proforma') {
                console.log(`Skipping proforma ${documentId} - proformas should not have payments`);
                skippedProformas++;
                continue;
            }

            if (documentData.payments && Array.isArray(documentData.payments) && documentData.payments.length > 0) {
                const documentPayments = [];
                const clientId = documentData.client?.id || documentData.clientId;

                // Validate client exists before migrating
                if (!clientId || clientId === 'unknown') {
                    console.warn(`Skipping document ${documentId} - no valid client ID`);
                    continue;
                }

                // Migrate each payment for this document
                // IMPORTANT: All old payments in the payments array were already applied to this invoice
                // So they should be marked as settledToDocument: true
                for (const payment of documentData.payments) {
                    const paymentData = {
                        userId: userId, // CRITICAL: Add userId for data isolation
                        clientId: clientId,
                        documentId: documentId,
                        amount: payment.amount || 0,
                        paymentDate: payment.date || payment.timestamp || new Date(),
                        paymentMethod: payment.method || 'migrated',
                        reference: `Migrated from ${documentData.type || 'document'} #${documentData.invoiceNumber || documentData.proformaNumber || documentData.documentNumber || 'N/A'}`,
                        notes: payment.note || 'Migrated payment - already applied to this invoice',
                        createdAt: payment.timestamp || new Date(),
                        updatedAt: new Date(),
                        migrated: true,
                        settledToDocument: true // This payment was in the document's payments array, so it was already applied
                    };

                    const newPaymentRef = await addDoc(collection(db, 'payments'), paymentData);
                    documentPayments.push(newPaymentRef.id);
                    migratedCount++;
                }

                // Calculate total paid from payments
                const totalPaid = documentData.payments.reduce((sum, p) => sum + (p.amount || 0), 0);

                // Store migration result for verification
                migrationResults.push({
                    documentId,
                    documentType: documentData.type,
                    originalPaymentsCount: documentData.payments.length,
                    migratedPaymentIds: documentPayments,
                    totalPaid: totalPaid
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
            console.log('Migration successful, updating documents...');

            for (const result of migrationResults) {
                await updateDoc(doc(db, `documents/${userId}/userDocuments`, result.documentId), {
                    payments: [], // Clear old payments
                    totalPaid: result.totalPaid, // Set total paid amount
                    migrationCompleted: true,
                    migrationDate: new Date(),
                    migratedPaymentCount: result.originalPaymentsCount
                });
            }
        }

        console.log(`SAFE Migration completed. Migrated ${migratedCount} payments from ${migrationResults.length} documents. Skipped ${skippedProformas} proformas.`);
        return {
            success: true,
            migratedCount,
            documentsProcessed: migrationResults.length,
            skippedProformas,
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
        
        // Check payments collection (filtered by user)
        const paymentsQuery = query(
            collection(db, 'payments'),
            where('userId', '==', userId)
        );
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

// Comprehensive repair function to fix all payment data
export const repairMigratedPayments = async (userId) => {
    try {
        console.log('Starting comprehensive payment repair...');

        // Get all payments (not just migrated ones) - filtered by user
        const paymentsQuery = query(
            collection(db, 'payments'),
            where('userId', '==', userId)
        );
        const paymentsSnapshot = await getDocs(paymentsQuery);
        let repairedCount = 0;
        let fixedSettlement = 0;

        // Get all documents to match with payments
        const documentsQuery = query(collection(db, `documents/${userId}/userDocuments`));
        const documentsSnapshot = await getDocs(documentsQuery);
        const documentsMap = new Map();
        documentsSnapshot.forEach(doc => {
            documentsMap.set(doc.id, doc.data());
        });

        // Get all clients
        const clientsQuery = query(collection(db, `clients/${userId}/userClients`));
        const clientsSnapshot = await getDocs(clientsQuery);
        const clientsMap = new Map();
        clientsSnapshot.forEach(doc => {
            clientsMap.set(doc.id, doc.data());
        });

        console.log(`Found ${paymentsSnapshot.size} payments, ${documentsSnapshot.size} documents, ${clientsSnapshot.size} clients`);

        for (const paymentDoc of paymentsSnapshot.docs) {
            const payment = paymentDoc.data();

            // CRITICAL FIX: If payment has documentId, it should be marked as settled
            // If migrated and has documentId, it was already applied to that invoice
            const shouldBeSettled = payment.documentId && payment.documentId !== null;

            const documentData = payment.documentId ? documentsMap.get(payment.documentId) : null;

            if (documentData) {
                const clientId = documentData.client?.id || documentData.clientId;
                const clientData = clientsMap.get(clientId);

                if (clientId && clientId !== 'unknown' && clientData) {
                    const updatedPaymentData = {
                        userId: userId, // Ensure userId is set
                        clientId: clientId,
                        clientName: clientData.name,
                        reference: payment.reference || `Migrated from ${documentData.type || 'document'} #${documentData.invoiceNumber || documentData.proformaNumber || documentData.documentNumber || 'N/A'}`,
                        settledToDocument: shouldBeSettled, // Mark as settled if it has a documentId
                        updatedAt: new Date(),
                        repaired: true
                    };

                    await updateDoc(doc(db, 'payments', paymentDoc.id), updatedPaymentData);
                    repairedCount++;
                    if (shouldBeSettled && !payment.settledToDocument) {
                        fixedSettlement++;
                    }
                    console.log(`Repaired payment for client: ${clientData.name}, settled: ${shouldBeSettled}`);
                } else if (clientId && clientId !== 'unknown') {
                    // Client ID exists but client data not found - just update the reference
                    const updatedPaymentData = {
                        userId: userId, // Ensure userId is set
                        reference: payment.reference || `Migrated from ${documentData.type || 'document'} #${documentData.invoiceNumber || documentData.proformaNumber || documentData.documentNumber || 'N/A'}`,
                        settledToDocument: shouldBeSettled,
                        updatedAt: new Date(),
                        repaired: true
                    };

                    await updateDoc(doc(db, 'payments', paymentDoc.id), updatedPaymentData);
                    repairedCount++;
                    if (shouldBeSettled && !payment.settledToDocument) {
                        fixedSettlement++;
                    }
                    console.log(`Updated payment reference for client ID: ${clientId}`);
                } else {
                    console.log(`Skipping payment - client not found: ${clientId}`);
                }
            } else if (payment.documentId) {
                // Payment has documentId but document not found - mark as settled anyway
                console.log(`Warning: Payment references missing document ${payment.documentId}, marking as settled`);
                await updateDoc(doc(db, 'payments', paymentDoc.id), {
                    userId: userId, // Ensure userId is set
                    settledToDocument: true,
                    updatedAt: new Date(),
                    repaired: true
                });
                fixedSettlement++;
                repairedCount++;
            } else {
                // Payment has no documentId - this is a client account payment, mark as unsettled
                console.log(`Payment ${paymentDoc.id} has no document - marking as client account payment`);
                await updateDoc(doc(db, 'payments', paymentDoc.id), {
                    userId: userId, // Ensure userId is set
                    settledToDocument: false,
                    updatedAt: new Date(),
                    repaired: true
                });
                repairedCount++;
            }
        }

        console.log(`Payment repair completed. Repaired ${repairedCount} payments. Fixed settlement status on ${fixedSettlement} payments.`);
        return { success: true, repairedCount, fixedSettlement };

    } catch (error) {
        console.error('Payment repair failed:', error);
        return { success: false, error: error.message };
    }
};
