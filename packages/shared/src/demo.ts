/**
 * Demo roster shared by the app's demo data and the API's seed accounts, so a
 * demo player on the phone and their demo account have the same name and number.
 * Numbers are fake (90000 000xx).
 */
export const DEMO_TEAMS: readonly [string, string[]][] = [
  [
    'Royal Strikers',
    [
      'Aarav Sharma',
      'Rohan Mehta',
      'Vikram Singh',
      'Karan Patel',
      'Arjun Nair',
      'Siddharth Rao',
      'Manish Yadav',
      'Pranav Joshi',
      'Harsh Gupta',
      'Nikhil Verma',
      'Deepak Chauhan',
    ],
  ],
  [
    'Thunder Kings',
    [
      'Ishaan Reddy',
      'Aditya Kulkarni',
      'Rahul Desai',
      'Varun Iyer',
      'Kunal Shah',
      'Yash Malhotra',
      'Gaurav Pandey',
      'Sameer Khan',
      'Abhishek Mishra',
      'Tarun Bhatt',
      'Mohit Saini',
    ],
  ],
  [
    'Coastal Warriors',
    [
      'Dev Menon',
      'Akash Pillai',
      'Rajat Jain',
      'Sahil Kapoor',
      'Ankit Tiwari',
      'Ritesh Dubey',
      'Vivek Sinha',
      'Naveen Kumar',
      'Sunil Rawat',
      'Imran Qureshi',
      'Ajay Thakur',
    ],
  ],
  [
    'Desert Eagles',
    [
      'Kabir Bhatia',
      'Om Prakash',
      'Lakshya Sen',
      'Parth Agarwal',
      'Ravi Bishnoi',
      'Hemant Rathore',
      'Jatin Saxena',
      'Uday Chopra',
      'Bharat Meena',
      'Firoz Ali',
      'Chetan Gehlot',
    ],
  ],
];

/** Fake, recognisable number for player `i` of demo team `t`: 9000000001 upwards. */
export function demoMobile(team: number, index: number): string {
  return `90000${String(team * 11 + index + 1).padStart(5, '0')}`;
}
