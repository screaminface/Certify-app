import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import { Participant, Group } from '../db/database';
import { formatDateBG } from './medicalValidation';

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
  console.log('🔵 Starting certificate generation for:', participant.personName);
  
  try {
    // Validate required fields
    if (!participant.personName || !participant.uniqueNumber) {
      throw new Error('Missing required participant fields: personName or uniqueNumber');
    }

    if (!group) {
      throw new Error('Group information is required for certificate generation');
    }

    // Calculate protocol number: groupNumber * 5
    // Group 1 => F08 = 5, Group 2 => F08 = 10, Group 3 => F08 = 15, etc.
    // If group has no number yet (planned), use 0
    const protocolNumber = (group.groupNumber || 0) * 5;
    console.log(`📋 Group ${group.groupNumber || 'planned'} => F08 = ${protocolNumber}`);

    // Fetch the template from public folder
    console.log('📄 Fetching template from /Certify-app/template.docx...');
    const templatePath = '/Certify-app/template.docx';
    const response = await fetch(templatePath);
    
    if (!response.ok) {
      console.error('❌ Template fetch failed:', response.status, response.statusText);
      throw new Error(`Template not found: ${response.status} ${response.statusText}. Please ensure template.docx exists in /public/ folder.`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    console.log('✅ Template loaded successfully, size:', arrayBuffer.byteLength, 'bytes');

    // Load the template with custom delimiters {{ }}
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
    console.log('🎲 Random grade selected:', grade.text, `(${grade.value})`);

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

    console.log('📝 Certificate data prepared:', {
      uniqueNumber: data.F01,
      name: data.F03,
      egn: data.F04,
      birthPlace: data.F05,
      citizenship: data.F06,
      year: data.F07,
      protocol: data.F08,
      grade: `${data.F09} (${data.F10})`
    });

    // Render the document
    console.log('⚙️ Rendering document...');
    doc.render(data);
    console.log('✅ Document rendered successfully');

    // Generate the output
    const buf = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    // Create sanitized filename
    const sanitizedName = sanitizeFileName(participant.personName);
    const sanitizedNumber = sanitizeFileName(participant.uniqueNumber);
    const fileName = `udostoverenie_${sanitizedNumber}_${sanitizedName}.docx`;
    
    console.log('💾 Saving file:', fileName);
    saveAs(buf, fileName);
    console.log('✅ Certificate generated successfully!');
    
  } catch (error) {
    console.error('❌ Certificate generation failed:', error);
    
    if (error instanceof Error) {
      // Provide more specific error messages
      if (error.message.includes('Template not found')) {
        console.error('💡 Make sure template.docx file exists in /public/ folder');
      } else if (error.message.includes('render')) {
        console.error('💡 Check if all placeholders in template match {{F01}} to {{F10}}');
      }
    }
    
    throw error;
  }
}

// Function to generate certificates for multiple participants
export async function generateBulkCertificates(
  participants: Participant[],
  group: Group,
  courseDate?: string
): Promise<void> {
  console.log(`🔵 Starting bulk certificate generation for ${participants.length} participants`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const participant of participants) {
    try {
      await generateCertificate(participant, group, courseDate);
      successCount++;
      // Small delay to prevent browser from blocking multiple downloads
      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (error) {
      failCount++;
      console.error(`❌ Failed to generate certificate for ${participant.personName}:`, error);
    }
  }
  
  console.log(`✅ Bulk generation complete: ${successCount} successful, ${failCount} failed`);
  
  if (failCount > 0) {
    throw new Error(`${failCount} certificate(s) failed to generate. Check console for details.`);
  }
}
