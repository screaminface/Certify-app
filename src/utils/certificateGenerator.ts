import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { Participant, Group } from '../db/database';
import { formatDateBG } from './medicalValidation';
import { saveFile } from './fileDownload';

export interface CertificateData {
  F01: string; // Certificate number (uniqueNumber)
  F02: string; // Course date (DD.MM.YYYY)
  F03: string; // Full name
  F04: string; // EGN
  F05: string; // Birth place
  F06: string; // Citizenship
  F07: string; // Year (YYYY)
  F08: string; // Protocol number
  F09: string; // Grade text: "Отличен" or "Мн. добър"
  F10: string; // Grade value: "6" or "5"
}

function pickGrade(): { text: string; value: string } {
  // 70% chance for Отличен (6.00), 30% chance for Мн. добър (5.00)
  return Math.random() < 0.7
    ? { text: 'Отличен', value: '6.00' }
    : { text: 'Мн. добър', value: '5.00' };
}

function sanitizeFileName(name: string): string {
  // Remove invalid filename characters and replace multiple spaces
  return name
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 200); // Limit length
}

export async function generateCertificate(
  participant: Participant,
  group: Group,
  courseDate?: string
): Promise<void> {
  try {
    // Validate required fields
    if (!participant.personName || !participant.uniqueNumber) {
      throw new Error('Missing required participant fields: personName or uniqueNumber');
    }

    if (!group) {
      throw new Error('Group information is required for certificate generation');
    }

    // Calculate protocol number: groupNumber * 5
    const protocolNumber = (group.groupNumber || 0) * 5;

    // Fetch the template from public folder
    const templatePath = '/Certify-app/template.docx';
    const response = await fetch(templatePath);
    
    if (!response.ok) {
      throw new Error(`Template not found: ${response.status} ${response.statusText}. Please ensure template.docx exists in /public/ folder.`);
    }
    
    const arrayBuffer = await response.arrayBuffer();

    // Load the template
    const zip = new PizZip(arrayBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: {
        start: '{{',
        end: '}}'
      }
    });

    // Pick random grade
    const grade = pickGrade();

    // Determine course date
    const effectiveCourseDate = courseDate || participant.courseEndDate;
    const formattedCourseDate = formatDateBG(effectiveCourseDate);
    
    // Extract year from course date
    const courseYear = new Date(effectiveCourseDate).getFullYear().toString();

    // Prepare certificate data - ALL FIELDS AS STRINGS
    const data: CertificateData = {
      F01: String(participant.uniqueNumber || ''),
      F02: formattedCourseDate,
      F03: String(participant.personName || ''),
      F04: String(participant.egn || ''), // EGN as string to prevent conversion
      F05: String(participant.birthPlace || ''),
      F06: String(participant.citizenship || 'българско'),
      F07: courseYear,
      F08: String(protocolNumber), // Protocol based on group.protocol_group * 5
      F09: grade.text,
      F10: grade.value,
    };

    // Render the document
    doc.render(data);

    // Generate the output
    const buf = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    // Create sanitized filename
    const sanitizedName = sanitizeFileName(participant.personName);
    const sanitizedNumber = sanitizeFileName(participant.uniqueNumber);
    const fileName = `udostoverenie_${sanitizedNumber}_${sanitizedName}.docx`;
    
    await saveFile(buf, fileName);
    
  } catch (error) {
    console.error('Certificate generation failed:', error);
    throw error;
  }
}

// Function to generate certificates for multiple participants
export async function generateBulkCertificates(
  participants: Participant[],
  group: Group,
  courseDate?: string
): Promise<void> {
  let successCount = 0;
  let failCount = 0;
  
  for (const participant of participants) {
    try {
      await generateCertificate(participant, group, courseDate);
      successCount++;
      // Small delay to prevent overwhelming the user with file dialogs
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      failCount++;
      console.error(`Failed to generate certificate for ${participant.personName}:`, error);
    }
  }
  
  if (failCount > 0) {
    throw new Error(`${failCount} certificate(s) failed to generate.`);
  }
}
