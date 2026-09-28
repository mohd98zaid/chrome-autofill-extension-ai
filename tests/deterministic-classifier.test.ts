import { describe, it, expect, beforeEach } from 'vitest';
import { DeterministicClassifier } from '../src/content/classifier/deterministic-classifier';
import { FieldDescriptor } from '../src/types/taxonomy';

describe('DeterministicClassifier', () => {
  let classifier: DeterministicClassifier;

  beforeEach(() => {
    classifier = new DeterministicClassifier();
  });

  const baseField: FieldDescriptor = {
    id: 'f_test',
    fieldSignature: 'sig_123',
    controlType: 'text',
    isVisible: true,
    isDisabled: false,
    isReadOnly: false,
    isRequired: false,
    currentValue: null,
    selector: 'input'
  };

  it('classifies first_name from autocomplete', () => {
    const field: FieldDescriptor = {
      ...baseField,
      selector: 'input[autocomplete="given-name"]'
    };
    const res = classifier.classify(field);
    expect(res.semanticType).toBe('first_name');
    expect(res.confidence).toBeGreaterThanOrEqual(0.95);
    expect(res.source).toBe('deterministic');
  });

  it('classifies email from htmlType and label', () => {
    const field: FieldDescriptor = {
      ...baseField,
      htmlType: 'email',
      labelText: 'Your Email Address *'
    };
    const res = classifier.classify(field);
    expect(res.semanticType).toBe('email');
    expect(res.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('classifies phone from label and name', () => {
    const field: FieldDescriptor = {
      ...baseField,
      htmlType: 'tel',
      name: 'applicant_phone',
      labelText: 'Mobile Phone'
    };
    const res = classifier.classify(field);
    expect(res.semanticType).toBe('phone');
    expect(res.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('classifies work authorization correctly', () => {
    const field: FieldDescriptor = {
      ...baseField,
      labelText: 'Are you legally authorized to work in the United States?'
    };
    const res = classifier.classify(field);
    expect(res.semanticType).toBe('work_authorization');
    expect(res.confidence).toBeGreaterThanOrEqual(0.90);
  });

  it('classifies skills field from section heading and placeholder', () => {
    const field: FieldDescriptor = {
      ...baseField,
      sectionHeading: 'Technical Skills & Competencies',
      placeholder: 'List your core technologies and frameworks'
    };
    const res = classifier.classify(field);
    expect(res.semanticType).toBe('skills');
    expect(res.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('classifies linkedin profile link', () => {
    const field: FieldDescriptor = {
      ...baseField,
      labelText: 'LinkedIn Profile URL'
    };
    const res = classifier.classify(field);
    expect(res.semanticType).toBe('linkedin');
    expect(res.confidence).toBeGreaterThanOrEqual(0.90);
  });

  it('prioritizes user-confirmed site mappings with highest confidence', () => {
    classifier.setKnownMappings([
      {
        id: 'map_custom',
        domain: 'jobsite.com',
        pathPattern: '',
        fieldSignature: 'sig_custom_1',
        semanticType: 'notice_period',
        controlType: 'text',
        confidence: 0.99,
        source: 'user_confirmed',
        version: 1,
        createdAt: '',
        updatedAt: ''
      }
    ]);

    const field: FieldDescriptor = {
      ...baseField,
      fieldSignature: 'sig_custom_1',
      labelText: 'Unknown Custom Prompt'
    };

    const res = classifier.classify(field);
    expect(res.semanticType).toBe('notice_period');
    expect(res.confidence).toBeGreaterThanOrEqual(0.98);
    expect(res.source).toBe('known_mapping');
  });

  it('correctly classifies Workday specific fields (school, degree, phone device type, extension, role description, languages)', () => {
    // School or University
    const schoolField: FieldDescriptor = { ...baseField, labelText: 'School or University *' };
    expect(classifier.classify(schoolField).semanticType).toBe('school');

    // Degree
    const degreeField: FieldDescriptor = { ...baseField, labelText: 'Degree *', controlType: 'select' };
    expect(classifier.classify(degreeField).semanticType).toBe('degree');

    // Phone Device Type
    const deviceTypeField: FieldDescriptor = { ...baseField, labelText: 'Phone Device Type *', controlType: 'select' };
    expect(classifier.classify(deviceTypeField).semanticType).toBe('phone_device_type');

    // Phone Extension
    const extensionField: FieldDescriptor = { ...baseField, labelText: 'Phone Extension' };
    expect(classifier.classify(extensionField).semanticType).toBe('phone_extension');

    // Role Description
    const roleDescField: FieldDescriptor = { ...baseField, labelText: 'Role Description', controlType: 'textarea' };
    expect(classifier.classify(roleDescField).semanticType).toBe('job_description');

    // Language Fluency
    const fluencyField: FieldDescriptor = { ...baseField, labelText: 'I am fluent in this language.', controlType: 'checkbox' };
    expect(classifier.classify(fluencyField).semanticType).toBe('language_fluency');

    // Language Comprehension
    const compField: FieldDescriptor = { ...baseField, labelText: 'Comprehension *', controlType: 'select' };
    expect(classifier.classify(compField).semanticType).toBe('language_proficiency');

    // Skills tag input
    const skillsTagField: FieldDescriptor = {
      ...baseField,
      labelText: 'Type to Add Skills *',
      nearbyText: 'Enter a skill below and press Enter to see available options. Options load only after you press Enter.',
      controlType: 'tag_input'
    };
    expect(classifier.classify(skillsTagField).semanticType).toBe('skills');

    // Experience Company
    const companyField: FieldDescriptor = { ...baseField, labelText: 'Company *' };
    expect(classifier.classify(companyField).semanticType).toBe('current_company');

    // Experience Location
    const locField: FieldDescriptor = { ...baseField, labelText: 'Location' };
    expect(classifier.classify(locField).semanticType).toBe('city');

    // Currently Work Here Checkbox
    const currWorkField: FieldDescriptor = { ...baseField, labelText: 'I currently work here', controlType: 'checkbox' };
    expect(classifier.classify(currWorkField).semanticType).toBe('currently_work_here');

    // Start Date & End Date
    const startField: FieldDescriptor = { ...baseField, labelText: 'From *' };
    expect(classifier.classify(startField).semanticType).toBe('start_date');

    const endField: FieldDescriptor = { ...baseField, labelText: 'To *' };
    expect(classifier.classify(endField).semanticType).toBe('end_date');
  });

  it('correctly classifies combined First & Last Name questions as full_name', () => {
    const field1: FieldDescriptor = { ...baseField, labelText: '3. First & Last Name *' };
    expect(classifier.classify(field1).semanticType).toBe('full_name');

    const field2: FieldDescriptor = { ...baseField, labelText: 'First and Last Name' };
    expect(classifier.classify(field2).semanticType).toBe('full_name');

    const field3: FieldDescriptor = { ...baseField, labelText: 'First Name & Last Name' };
    expect(classifier.classify(field3).semanticType).toBe('full_name');

    const emailField: FieldDescriptor = { ...baseField, labelText: '4. Email Address *' };
    expect(classifier.classify(emailField).semanticType).toBe('email');
  });
});
